import * as vscode from 'vscode';
import { getTest, isFile } from './helpers';

export async function runHandler(
    shouldDebug: boolean,
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    controller: vscode.TestController
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
    // Error match, with either (at filename line:123) or (at filename:123)
    const svFailRe   = /^ERROR: \[(\d+)\]\[(\w+)\]: (\w+): (.*) \(at (?:(.*) line:(\d+))|(?:(.*):(\d+)\))/;

    let startTime = Date.now();
    let failMessages: vscode.TestMessage[] = [];
    let test: vscode.TestItem | undefined;
    process.stdout.on('data', (data: any) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
            // console.log("Line: " + line);
            // If line starts with Usage: show an error message
            if (line.startsWith('Usage:')) {
                vscode.window.showErrorMessage(line);
            }
            if (line.startsWith('INFO:')) {
                const svStatus = svStatusRe.exec(line);
                if (svStatus) {
                    const [_, simTime, shortFileName, testName, status] = svStatus;
                    test = getTest(shortFileName, testName, controller);
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