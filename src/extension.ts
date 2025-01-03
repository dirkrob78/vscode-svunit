import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    const controller = vscode.tests.createTestController('SVUnitTestController', 'SVUnit Tests');
    context.subscriptions.push(controller);

    controller.resolveHandler = async test => {
        if (!test) {
            console.log('Discovering all files in workspace...');
            await discoverAllFilesInWorkspace();
        } else {
            console.log(`Parsing tests in file: ${test.uri?.toString()}`);
            await parseTestsInFileContents(test);
        }
    };

	console.log('2 Discovering all files in workspace...');
	discoverAllFilesInWorkspace();

	controller.createRunProfile(
		'Run',
		vscode.TestRunProfileKind.Run,
		(request, token) => {
			runHandler(false, request, token);
		}
	);

	// Helper functions:
	async function discoverAllFilesInWorkspace() {
		if (!vscode.workspace.workspaceFolders) {
			return []; // handle the case of no open folders
		}

		return Promise.all(
			vscode.workspace.workspaceFolders.map(async workspaceFolder => {
				//const pattern = new vscode.RelativePattern(workspaceFolder, '**/*unit_test.sv');
				const pattern = '**/*unit_test.sv';
				const watcher = vscode.workspace.createFileSystemWatcher(pattern);

				// When files are created, make sure there's a corresponding "file" node in the tree
				watcher.onDidCreate(uri => getOrCreateFile(uri));
				// When files change, re-parse them. Note that you could optimize this so
				// that you only re-parse children that have been resolved in the past.
				watcher.onDidChange(uri => parseTestsInFileContents(getOrCreateFile(uri)));
				// And, finally, delete TestItems for removed files. This is simple, since
				// we use the URI as the TestItem's ID.
				watcher.onDidDelete(uri => controller.items.delete(uri.toString()));

				for (const file of await vscode.workspace.findFiles(pattern)) {
					getOrCreateFile(file);
				}

				return watcher;
			})
		);
	}

    function getOrCreateFile(uri: vscode.Uri) {
        const existing = controller.items.get(uri.toString());
        if (existing) {
            return existing;
        }

        const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
        file.canResolveChildren = true;
        controller.items.add(file);
        return file;
    }

    async function parseTestsInFileContents(file: vscode.TestItem, contents?: string) {
        if (!file.uri) {
            console.log('File URI is undefined.');
            return;
        }

        if (contents === undefined) {
            const rawContent = await vscode.workspace.fs.readFile(file.uri);
            contents = new TextDecoder().decode(rawContent);
        }

        const svtestRe = /^\s*`SVTEST\s*\(\s*(\w+)\s*\)/;
        const svtestEndRe = /^\s*`SVTEST_END/;

        const lines = contents.split('\n');

        let startLineNo = -1;
        let label = "";

        // Delete all children
        file.children.forEach(child => file.children.delete(child.id));

        lines.forEach((line, lineNo) => {
            const svtest = svtestRe.exec(line);
            if (svtest) {
                [, label] = svtest;
                startLineNo = lineNo;
            }

            const svtestEnd = svtestEndRe.exec(line);
            if (svtestEnd && startLineNo !== -1) {
                const range = new vscode.Range(new vscode.Position(startLineNo, 0), new vscode.Position(lineNo, line.length));
                const tcase = controller.createTestItem(label, label, file.uri);
                tcase.range = range;
                file.children.add(tcase);
                console.log(`Added test case: ${label}`);
            }
        });
    }

	async function runHandler(
		shouldDebug: boolean,
		request: vscode.TestRunRequest,
		token: vscode.CancellationToken
	) {
		const run = controller.createTestRun(request);

		function* filterAndMapTests(tests: ReadonlyArray<vscode.TestItem>): Generator<string> {
			for (const test of tests) {
				if (!isFile(test)) {
					let parentShortLabel = test.parent?.label
						.replace(/_unit_test\.sv$/, '_ut');
					yield parentShortLabel + '.' + test.label;
				}
			}
		}

		// Add requested tests to SVUnit filter
		let svunitFilter = '';
		if (request.include && request.include.length > 0)
			svunitFilter += [...filterAndMapTests(request.include)].join(':');
		if (request.exclude && request.exclude.length > 0)
			svunitFilter += '-' + [...filterAndMapTests(request.exclude)].join(':');
		if (svunitFilter.length == 0)
			svunitFilter = '\'*\'';

		// Split runCommand into arguments
        let runCommand = vscode.workspace.getConfiguration('svunit').get('runCommand') as string;
		runCommand += ' --filter ' + svunitFilter;

        // Launch SVUnit and process output lines without delay
		// TODO: add setup script option
        const process = require('child_process').spawn(runCommand, [],
			{ shell: true, 
				cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
		console.log('Dir: ' + vscode.workspace.workspaceFolders?.[0].uri.fsPath);

        const svStatusRe = /^INFO:  \[(\d+)\]\[(\w+)\]: (\w+)::(RUNNING|PASSED|FAILED)/;
        const svEqFailRe = /^ERROR: \[(\d+)\]\[(\w+)\]: (\w+): \((.*)\) \!\=\= \((.*)\) \(at (.*) line:(\d+)\)/;
        const svFailRe   = /^ERROR: \[(\d+)\]\[(\w+)\]: (.*) \(at (.*) line:(\d+)\)/;

		let startTime = Date.now();
		let failMessages: vscode.TestMessage[] = [];
		let test: vscode.TestItem | undefined;
		process.stdout.on('data', (data: any) => {
			const lines = data.toString().split('\n');
			lines.forEach((line: string) => {
				console.log("Line: " + line);
				// If line starts with Usage: show an error message
				if (line.startsWith('Usage:')) {
					vscode.window.showErrorMessage(line);
				}
				if (line.startsWith('INFO:')) {
					const svStatus = svStatusRe.exec(line);
					if (svStatus) {
						const [_, simTime, shortFileName, testName, status] = svStatus;
						test = getTest(shortFileName, testName);
						// Skip if test is undefined
						if (!test)
							return;
						if (status === 'RUNNING') {
							run.started(test);
							startTime = Date.now();
							failMessages = [];
						} else if (status === 'PASSED') {
							let duration = Date.now() - startTime;
							run.passed(test, duration);
						} else if (status === 'FAILED') {
							let duration = Date.now() - startTime;
							run.failed(test, failMessages, duration);
						}
						return;
					}
				}
				const svEqFail = svEqFailRe.exec(line);
				if (svEqFail) {
					const [_, simTime, shortFileName, check, actual, expected, fileName, lineNo] = svEqFail;
					// Skip if test is undefined
					if (!test)
						return;
					let message = vscode.TestMessage.diff(check, expected, actual);
					message.location = new vscode.Location(vscode.Uri.file(fileName), new vscode.Position(parseInt(lineNo) - 1, 0));
					failMessages.push(message);
					return;
				}
				const svFail = svFailRe.exec(line);
				if (svFail) {
					const [_, simTime, shortFileName, check, fileName, lineNo] = svFail;
					// Skip if test is undefined
					if (!test)
						return;
					// create a message with the error
					let message = new vscode.TestMessage(check);
					message.location = new vscode.Location(vscode.Uri.file(fileName), new vscode.Position(parseInt(lineNo) - 1, 0));
					failMessages.push(message);
					return;
				}
			});
		});

		// Show error message if process exits with error
		process.on('error', (err: any) => {
			vscode.window.showErrorMessage(err);
			console.log(`Child exited with code ${err}`);
		});

		// Start process
		process.stderr.on('data', (data: any) => {
            console.error(`stderr: ${data}`);
        });

        process.on('error', (err: any) => {
            console.error(`Failed to start process: ${err}`);
        });

		// Make sure to end the run after all tests have been executed:
        process.on('close', (code: number) => {
            console.log(`child process exited with code ${code}`);
            run.end();
        });

	}

	function isFile(test: vscode.TestItem) {
		return test.canResolveChildren;
	}

	function getTest(shortFileName: string, testName: string): vscode.TestItem | undefined {
		const parentLabel = shortFileName.replace('_ut', '_unit_test.sv');
		for (const item of controller.items) {
			if (item[1].label === parentLabel) {
				return item[1].children.get(testName);
			}
		}
		return undefined;
	}

}