import * as vscode from 'vscode';
//import { getContentFromFilesystem, TestCase, testData, TestFile } from './testTree';

export async function activate(context: vscode.ExtensionContext) {
	const ctrl = vscode.tests.createTestController('SVUnitTestController', 'SVUnit Tests');
	context.subscriptions.push(ctrl);

	// Get a list of test files ending with _unit_test.sv
	const testFiles = await vscode.workspace.findFiles('**/*_unit_test.sv');

	testFiles.forEach(file => {
		parseSVUnitTestFile(file, ctrl);
	});

}

export async function parseSVUnitTestFile(file: vscode.Uri, 
			ctrl: vscode.TestController) {
	const svtestRe = /^\s*`SVTEST\s*\(\s*(\w+)\s*\)/;
	const svtestEndRe = /^\s*`SVTEST_END/;

	const fileContent = await vscode.workspace.fs.readFile(file);
	const lines = fileContent.toString().split('\n');

	const relativePath = vscode.workspace.asRelativePath(file);
	const testFile = ctrl.createTestItem(relativePath, relativePath, file);
	ctrl.items.add(testFile);

	let startLineNo = -1;
	let label = "";
	lines.forEach((line, lineNo) => {
		const svtest = svtestRe.exec(line);
		if (svtest) {
			[, label] = svtest;
			startLineNo = lineNo;
		}

		const svtestEnd = svtestEndRe.exec(line);
		if (svtestEnd && startLineNo !== -1) {
			const range = new vscode.Range(new vscode.Position(startLineNo, 0), new vscode.Position(lineNo, line.length));
			const tcase = ctrl.createTestItem(relativePath+'/'+label, label, file);
			tcase.range = range;
			testFile.children.add(tcase);
		}
	});
};

