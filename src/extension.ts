import * as vscode from 'vscode';
import { TestRunner } from './runHandler';
import { discoverAllFilesInWorkspace, parseTestsInFileContents } from './parser';

export async function activate(context: vscode.ExtensionContext) {
    const controller = vscode.tests.createTestController(
        'SVUnitTestController',
        'SVUnit Tests'
    );
    context.subscriptions.push(controller);

    controller.resolveHandler = async test => {
        if (!test) {
            console.log('Discovering all files in workspace...');
            await discoverAllFilesInWorkspace(controller);
        } else {
            console.log(`Parsing tests in file: ${test.uri?.toString()}`);
            await parseTestsInFileContents(controller, test);
        }
    };

    const testRunner = new TestRunner(controller);

    controller.createRunProfile(
        'Run',
        vscode.TestRunProfileKind.Run,
        (request, token) => {
            testRunner.runHandler(false, request, token);
        }
    );
}