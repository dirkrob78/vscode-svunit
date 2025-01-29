import * as vscode from 'vscode';
import { getTest } from './helpers';

export class TestRunner {
    private controller: vscode.TestController;
    private shouldDebug: boolean;
    private request!: vscode.TestRunRequest;
    private token!: vscode.CancellationToken;
    private run!: vscode.TestRun;

    constructor(controller: vscode.TestController) {
        this.controller = controller;
        this.shouldDebug = false;
    }

    public async runHandler(
        shouldDebug: boolean,
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        this.shouldDebug = shouldDebug;
        this.request = request;
        this.token = token;
        this.run = this.controller.createTestRun(request);

        // Convert controller.items to an array and sort by label
        const sortedFolders = Array.from(this.controller.items).sort(
            (a, b) => a[1].label.localeCompare(b[1].label)
        );

        // Loop over top level of test items (folders containing test files)
        for (const folder of sortedFolders) {
            if (this.token.isCancellationRequested) {
                console.log('Cancellation requested, stopping.');
                break;
            }

            const testFolder = folder[1];
            if (testFolder.children.size === 0 ||
                this.request.exclude?.includes(testFolder)) {
                continue;
            }

            const testSelect = this.processTestFiles(testFolder);

            if (testSelect === undefined) {
                continue; // Skip this folder if no test files matched
            }

            const runCommand = this.constructRunCommand(testSelect);
            const cwd = `${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/${testFolder.label}`;
            this.run.appendOutput("cd " + cwd + '\r\n');
            this.run.appendOutput(runCommand + '\r\n');
            this.run.appendOutput(`Processing folder: ${testFolder.label}\r\n`);

            await this.executeCommand(runCommand, cwd, testFolder);
        }
        this.run.end();
    }

    private processTestFiles(testFolder: vscode.TestItem): string | undefined {
        let allFiles: string[] = [];
        let testFiles: string[] = [];
        let allIncludes: string[] = [];
        let allExcludes: string[] = [];
        let allPossibleIncludes: string[] = [];

        testFolder.children.forEach((testFile) => {
            const shortFileName = testFile.label.replace(/_unit_test\.sv$/, '_ut');
            allFiles.push(testFile.label);
            if (this.request.exclude?.includes(testFile)) {
                return;
            }

            // Process individual tests inside the file
            let includedTests: string[] = [];
            let excludedTests: string[] = [];
            testFile.children.forEach((testItem) => {
                if (this.request.exclude?.includes(testItem)) {
                    excludedTests.push(`${shortFileName}.${testItem.label}`);
                } else if (this.request.include?.includes(testItem)) {
                    includedTests.push(`${shortFileName}.${testItem.label}`);
                }
            });

            const isTestFileIncluded = (!this.request.include ||
                this.request.include.includes(testFile) ||
                this.request.include.includes(testFolder));

            if (isTestFileIncluded || includedTests.length > 0) {
                const defaultInclude = `${shortFileName}.*`;
                allPossibleIncludes.push(defaultInclude);
                if (includedTests.length === 0) {
                    includedTests = [defaultInclude];
                }
                testFiles.push(testFile.label);
                allIncludes.push(...includedTests);
                allExcludes.push(...excludedTests);
            }
        });

        // Construct the test select string like: "-t file1 -t file2 --filter file1.*-file2.test3"
        let testSelect = "";
        // If no test files matched, skip this folder by returning undefined
        if (testFiles.length == 0)
            return undefined
        
        // Determine if any other controller.items label startswith this testFolder as true/false
        let isAnyFolderASubfolder = false;
        this.controller.items.forEach((item) => {
            if (item.label.startsWith(testFolder.label) && item.label !== testFolder.label) {
                isAnyFolderASubfolder = true;
            }
        });

        // Include the test file options if needed:
        // 1. If not using all test files in the folder
        // 2. If there are subfolders that need to be excluded
        if (testFiles.length < testFolder.children.size || isAnyFolderASubfolder) {
            testSelect = testFiles.map(file => `-t ${file}`).join(' ');
        }

        let filterText = allIncludes.join(':');
        // If all tests are included, don't specify the filter include part
        if (filterText === allPossibleIncludes.join(':')) {
            filterText = "";
        }
        // Add exclude filter
        if (allExcludes.length > 0) {
            filterText += '-' + allExcludes.join(':');
        }

        if (filterText !== "") {
            if (testSelect !== "") {
                testSelect += " ";
            }
            testSelect += `--filter ${filterText}`;
        }
        return testSelect;
    }

    private constructRunCommand(testSelect: string): string {
        let simulator = vscode.workspace.getConfiguration('svunit').get('simulator') as string;
        let setupCommand = vscode.workspace.getConfiguration('svunit').get('setupCommand') as string;
        let runCommands = vscode.workspace.getConfiguration('svunit').get('runCommands') as Array<string>;
        let runCommand = runCommands[0];
        runCommands.slice(1).forEach((command) => {
            if (command.startsWith(simulator + ': ')) {
                runCommand = command.replace(simulator + ': ', '');
            }
        });
        runCommand = runCommand.replace(/\$SIMULATOR/g, simulator);
        runCommand = runCommand.replace(/\$TEST_SELECT/g, testSelect);
        if (setupCommand !== "")
            runCommand = setupCommand + ' && ' + runCommand;
        return runCommand;
    }

    private async executeCommand(
        runCommand: string,
        cwd: string,
        testFolder: vscode.TestItem
    ) {
        await new Promise<void>((resolve, reject) => {
            const process = require('child_process').spawn(runCommand, [], {
                shell: true,
                cwd: cwd
            });
            console.log('Dir: ' + cwd);

            // Abort the process upon cancellation
            this.token.onCancellationRequested(() => {
                process.kill();
                this.run.end();
                console.log('Process aborted due to cancellation.');
                reject(new Error('Process aborted due to cancellation.'));
            });

            const svStatusRe = /^INFO:  \[(\d+)\]\[(\w+)\]: (\w+)::(RUNNING|PASSED|FAILED)/;
            const svFailRe = /^ERROR: \[(\d+)\]\[(\w+)\]: (\w+): (.*) \(at (?:(.*) line:(\d+))|(?:(.*):(\d+)\))/;

            let test: vscode.TestItem | undefined;
            process.stderr.on('data', (data: any) => {
                const ansiRed = '\x1b[31m';
                const ansiReset = '\x1b[0m';
                this.run.appendOutput(
                    ansiRed + data.toString().replace(/\n/g, '\r\n') + ansiReset,
                    undefined,
                    test
                );
                console.error(`stderr: ${data}`);
            });

            let startTime = Date.now();
            let failMessages: vscode.TestMessage[] = [];
            process.stdout.on('data', (data: any) => {
                const lines = data.toString().split('\n');
                // Anything after the last newline is a partial line
                // send to test output but don't process
                let partialLine = lines.pop() || '';
                if (partialLine !== '')
                   this.run.appendOutput(partialLine, undefined, test);

                lines.forEach((line: string, index: number) => {
                    if (line.startsWith('Usage:')) {
                        vscode.window.showErrorMessage(line);
                    }
                    const svStatus = svStatusRe.exec(line);
                    let isTestDone = false;
                    let svFail: RegExpExecArray | null;
                    if (svStatus) {
                        const [_, simTime, shortFileName, testName, status] = svStatus;
                        test = getTest(shortFileName, testName, testFolder);
                        //this.run.appendOutput(line + '\r\n', undefined, test);
                        if (test) {
                            if (status === 'RUNNING') {
                                this.run.started(test);
                                startTime = Date.now();
                                failMessages = [];
                            } else if (status === 'PASSED') {
                                let duration = Date.now() - startTime;
                                this.run.passed(test, duration);
                                isTestDone = true;
                            } else if (status === 'FAILED') {
                                let duration = Date.now() - startTime;
                                this.run.failed(test, failMessages, duration);
                                isTestDone = true;
                            }
                        }
                    }
                    else if ( (svFail = svFailRe.exec(line)) ) {
                        const [_, simTime, shortFileName, check, messageStr, fileName, lineNo] = svFail;
                        if (test) {
                            let message = new vscode.TestMessage(messageStr);
                            message.location = new vscode.Location(
                                vscode.Uri.file(fileName),
                                new vscode.Position(parseInt(lineNo) - 1, 0)
                            );
                            failMessages.push(message);
                        }
                    }
                    this.run.appendOutput(line + '\r\n', undefined, test);
                    if (isTestDone)
                        test = undefined;
                });
            });

            process.on('error', (err: any) => {
                vscode.window.showErrorMessage(err.message);
                console.log(`Child exited with code ${err}`);
                reject(err);
            });

            process.on('close', (code: number) => {
                console.log(`child process exited with code ${code}`);
                resolve();
            });
        });
    }
}