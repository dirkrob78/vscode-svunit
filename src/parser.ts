import * as vscode from 'vscode';

const svtestRe = /^\s*`SVTEST\s*\(\s*(\w+)\s*\)/;
const svtestEndRe = /^\s*`SVTEST_END/;

export const parseSVUnitTestFile = (text: string, events: {
	onTest(range: vscode.Range, label: string): void;
}) => {
	const lines = text.split('\n');

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
			events.onTest(range, label);
		}
	});
};
