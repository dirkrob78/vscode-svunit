import * as vscode from 'vscode';
import { runHandler } from './runHandler';
import { discoverAllFilesInWorkspace, parseTestsInFileContents } from './parser';

export async function activate(context: vscode.ExtensionContext) {
    const controller = vscode.tests.createTestController('SVUnitTestController', 'SVUnit Tests');
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

	// console.log('2 Discovering all files in workspace...');
	// discoverAllFilesInWorkspace();

	controller.createRunProfile(
		'Run',
		vscode.TestRunProfileKind.Run,
		(request, token) => {
			runHandler(false, request, token, controller);
		}
	);
}