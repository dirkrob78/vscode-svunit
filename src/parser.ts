import path = require('path');
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
        await processTestFile(controller, file);
    }

    // Set up file system watcher
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(async file => {
        console.log(`File changed: ${file.toString()}`);
        await processTestFile(controller, file);
    });

    watcher.onDidCreate(async file => {
        console.log(`File created: ${file.toString()}`);
        await processTestFile(controller, file);
    });

    watcher.onDidDelete(uri => {
        // Remove the test item from the controller,
        // assumes uri of the test item is the file path
        console.log(`File deleted: ${uri.toString()}`);
        const testItem = controller.items.get(uri.toString());
        if (testItem) {
            // Save parent test item
            const parentTest = testItem.parent;
            // Delete the test item from it's parent list
            parentTest?.children.delete(testItem.id);
            // If parent test item (folder) is now empty, delete it too
            if (parentTest && parentTest.children.size === 0)
                parentTest.parent?.children.delete(parentTest.id);
        }
    });

    // Ensure the watcher is disposed when the extension is deactivated
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        watcher.dispose();
    });
}

async function processTestFile(controller: vscode.TestController, file: vscode.Uri) {
    const testFile = getOrCreateFile(controller, file);
    if (testFile)
        await parseTestsInFileContents(controller, testFile);
}

export function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    const dirname = path.dirname(relativePath) + '/';

    // Create or get the directory-level test item
    let dirItem = controller.items.get(dirname);
    if (!dirItem) {
        dirItem = controller.createTestItem(dirname, dirname);
        controller.items.add(dirItem);
    }

    // Create or get the file-level test item
    const existing = dirItem.children.get(uri.toString());
    if (existing) {
        return existing;
    }

    const file = controller.createTestItem(uri.toString(), path.basename(uri.fsPath), uri);
    file.canResolveChildren = true;
    dirItem.children.add(file);
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