import * as vscode from 'vscode';

export function getTest(
    shortFileName: string, 
    testName: string,
    testFolder: vscode.TestItem
): vscode.TestItem | undefined {
    const fileBaseName = shortFileName.replace('_ut', '_unit_test.sv');
    for (const item of testFolder.children) {
        if (item[1].label === fileBaseName) {
            return item[1].children.get(testName);
        }
    }
    return undefined;
}
