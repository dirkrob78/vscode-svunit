import * as vscode from 'vscode';

export function getTest(
    shortFileName: string, 
    testName: string,
    testFolder: vscode.TestItem
): vscode.TestItem | undefined {
    const fileBaseName = shortFileName.replace('_ut', '_unit_test.sv');
    let result: vscode.TestItem | undefined;
    
    testFolder.children.forEach(testFile => {
        if (testFile.label === fileBaseName) {
            result = testFile.children.get(testName);
        }
    });
    
    return result;
}

/**
 * Find the workspace folder that contains a given test item by traversing up the hierarchy
 * to find the root workspace item, then matching it to a workspace folder.
 */
export function getWorkspaceFolderForTest(testItem: vscode.TestItem): vscode.WorkspaceFolder | undefined {
    // Traverse up to find the root test item (workspace level)
    let current: vscode.TestItem | undefined = testItem;
    while (current && current.parent) {
        current = current.parent;
    }
    
    // The root test item's ID should be the workspace folder URI
    if (current && current.uri) {
        // Use VS Code's built-in workspace folder lookup
        return vscode.workspace.getWorkspaceFolder(current.uri);
    }
    
    return undefined;
}
