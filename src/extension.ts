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

	// Initial test discovery
	// console.log('Initial test discovery...');
	// await discoverAllFilesInWorkspace();

	async function discoverAllFilesInWorkspace() {
		if (!vscode.workspace.workspaceFolders) {
			return []; // handle the case of no open folders
		}

		return Promise.all(
			vscode.workspace.workspaceFolders.map(async workspaceFolder => {
				const pattern = new vscode.RelativePattern(workspaceFolder, '**/*unit_test.sv');
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
}
