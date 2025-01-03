import * as vscode from 'vscode';

export async function discoverAllFilesInWorkspace(controller: vscode.TestController) {
    if (!vscode.workspace.workspaceFolders) {
        console.log('No workspace folders found.');
        return; // handle the case of no open folders
    }

    const pattern = '**/*unit_test.sv';
    const testFiles = await vscode.workspace.findFiles(pattern);
    console.log(`Found ${testFiles.length} test files.`);
    for (const file of testFiles) {
        const testFile = getOrCreateFile(controller, file);
        await parseTestsInFileContents(controller, testFile);
    }
}

export function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
    const existing = controller.items.get(uri.toString());
    if (existing) {
        return existing;
    }

    const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
    file.canResolveChildren = true;
    controller.items.add(file);
    console.log(`Created test item for file: ${file.label}`);
    return file;
}

export async function parseTestsInFileContents(controller: vscode.TestController, file: vscode.TestItem, contents?: string) {
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