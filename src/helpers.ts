import * as vscode from 'vscode';

export function isFile(test: vscode.TestItem) {
    return test.canResolveChildren;
}

export function getTest(
    shortFileName: string, 
    testName: string,
    controller: vscode.TestController
): vscode.TestItem | undefined {
    const parentLabel = shortFileName.replace('_ut', '_unit_test.sv');
    for (const item of controller.items) {
        if (item[1].label === parentLabel) {
            return item[1].children.get(testName);
        }
    }
    return undefined;
}
