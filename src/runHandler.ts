import * as vscode from 'vscode';
import { getTest, isFile } from './helpers';

export async function runHandler(
    shouldDebug: boolean,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    controller: vscode.TestController
) {
    const run = controller.createTestRun(request);

    function filterAndMapTests(tests: ReadonlyArray<vscode.TestItem>, testFolder: vscode.TestItem): string[] {
        // Help create a filter string for SVUnit from list of tests
        return tests.flatMap(test => {
            if (!test.parent && test===testFolder) {
                // Top level - folders: run all tests in the folder
                return ['*'];
            } else if (!test.parent?.parent && test.parent===testFolder) {
                // 2nd level - test files: run all tests in the file
                if (!tests.includes(test.parent)) {
                    let shortFileName = test.label.replace(/_unit_test\.sv$/, '_ut');
                    return [`${shortFileName}.*`];
                }
                else
                    return [];
            } else if (test.parent?.parent===testFolder) {
                // 3rd level - individual tests: run the test
                if (!tests.includes(test.parent) && !tests.includes(test.parent?.parent)) {
                    let shortFileName = test.label.replace(/_unit_test\.sv$/, '_ut');
                    return [`${shortFileName}.${test.label}`];
                }
                else
                    return [];
            } else {
                return [];
            }
        });
    }

    // Convert controller.items to an array and sort by label
    const sortedFolders = Array.from(controller.items).sort((a, b) => a[1].label.localeCompare(b[1].label));

    // Loop over top level of test items (folders containing test files) in sorted order
    for (const folder of sortedFolders) {
        if (token.isCancellationRequested) {
            console.log('Cancellation requested, stopping.');
            break;
        }

        const testFolder = folder[1];
        if (testFolder.children.size == 0)
            continue;

        // Add requested tests to SVUnit filter
        let svunitFilter = '';
        if (request.include && request.include.length > 0)
            svunitFilter += [...filterAndMapTests(request.include, testFolder)].join(':');
        else
            svunitFilter = '*';

        // Skip if no tests are requested for this folder
        if (svunitFilter === '')
            continue;

        if (request.exclude && request.exclude.length > 0)
            svunitFilter += '-' + [...filterAndMapTests(request.exclude, testFolder)].join(':');
        svunitFilter = `'${svunitFilter}'`;

        // Split runCommand into arguments
        let simulator = vscode.workspace.getConfiguration('svunit').get('simulator') as string;
        let runCommands = vscode.workspace.getConfiguration('svunit').get('runCommands') as Array<string>;
        let runCommand = runCommands[0];
        runCommands.slice(1).forEach((command) => {
            if (command.startsWith(simulator + ': ')) {
                runCommand = command.replace(simulator + ': ', '');
            }
        });
        runCommand = runCommand.replace(/\$SIMULATOR/g, simulator);
        runCommand = runCommand.replace(/\$FILTER/g, svunitFilter);
        run.appendOutput(runCommand + '\r\n');

        run.appendOutput(`Processing folder: ${testFolder.label}\r\n`);

        // Launch SVUnit and process output lines without delay
        // TODO: add setup script option
        const cwd = `${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/${testFolder.label}`
        await new Promise<void>((resolve, reject) => {
            const process = require('child_process').spawn(runCommand, [], { shell: true, cwd: cwd });
            console.log('Dir: ' + cwd);

            // Abort the process upon cancellation
            token.onCancellationRequested(() => {
                process.kill();
                run.end();
                console.log('Process aborted due to cancellation.');
                reject(new Error('Process aborted due to cancellation.'));
            });

            const svStatusRe = /^INFO:  \[(\d+)\]\[(\w+)\]: (\w+)::(RUNNING|PASSED|FAILED)/;
            // Error match, with either (at filename line:123) or (at filename:123)
            const svFailRe   = /^ERROR: \[(\d+)\]\[(\w+)\]: (\w+): (.*) \(at (?:(.*) line:(\d+))|(?:(.*):(\d+)\))/;

            let test: vscode.TestItem | undefined;
            // capture process.stderr and add to test output in red
            process.stderr.on('data', (data: any) => {
                const ansiRed = '\x1b[31m';
                const ansiReset = '\x1b[0m';
                run.appendOutput(ansiRed + data.toString().replace(/\n/g, '\r\n')
                    + ansiReset, undefined, test);
                console.error(`stderr: ${data}`);
            });

            let startTime = Date.now();
            let failMessages: vscode.TestMessage[] = [];
            process.stdout.on('data', (data: any) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string, index: number) => {
                    // Ignore the last line if it is empty
                    if (index === lines.length - 1 && line === '') {
                        return;
                    }
                    // If line starts with Usage: show an error message
                    if (line.startsWith('Usage:')) {
                        vscode.window.showErrorMessage(line);
                    }
                    const svStatus = svStatusRe.exec(line);
                    if (svStatus) {
                        const [_, simTime, shortFileName, testName, status] = svStatus;
                        test = getTest(shortFileName, testName, testFolder);
                        run.appendOutput(line + '\r\n', undefined, test);
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
                            test = undefined;
                        } else if (status === 'FAILED') {
                            let duration = Date.now() - startTime;
                            run.failed(test, failMessages, duration);
                            test = undefined;
                        }
                        return;
                    }
                    // Add lines to the test output (or test can be undefined)
                    run.appendOutput(line + '\r\n', undefined, test);
                    const svFail = svFailRe.exec(line);
                    if (svFail) {
                        const [_, simTime, shortFileName, check, messageStr, fileName, lineNo] = svFail;
                        // Skip if test is undefined
                        if (!test)
                            return;
                        // create a message with the error
                        let message = new vscode.TestMessage(messageStr);
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
                reject(err);
            });

            // Make sure to end the run after all tests have been executed:
            process.on('close', (code: number) => {
                console.log(`child process exited with code ${code}`);
                resolve();
            });
        });
    }
    run.end();
}