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
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                console.log('No workspace folders found.');
                return;
            }
            
            // Iterate through all workspace folders and create a test item for each
            for (const workspaceFolder of workspaceFolders) {
                console.log(`Processing workspace folder: ${workspaceFolder.name}`);
                
                // Create or get workspace-level test item
                let workspaceItem = controller.items.get(workspaceFolder.uri.toString());
                if (!workspaceItem) {
                    workspaceItem = controller.createTestItem(
                        workspaceFolder.uri.toString(),
                        workspaceFolder.name,
                        workspaceFolder.uri
                    );
                    workspaceItem.canResolveChildren = true;
                    // Don't add to controller yet - wait until we know there are test files
                }
                
                const hasTests = await discoverAllFilesInWorkspace(controller, workspaceItem, workspaceFolder);
                
                // Only add workspace item if it contains test files
                if (hasTests && !controller.items.get(workspaceFolder.uri.toString())) {
                    controller.items.add(workspaceItem);
                }
            }
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