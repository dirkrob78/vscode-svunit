# Test Provider for SVUnit

Runs SVUnit and collects resuls in the Test Provider API.

## VS Code API

If certain tests are select to be included, or excluded (by hiding the test), runSVUnit will be called with an appropriate "--filter $FILTER"

The simulator can be changed by setting: svunit.simulator.

The run command can be set for each simulator setting in svunit.runCommands.

By default runSVUnit will be run from the directory of the project folder. To run SVUnit in multiple directories, add run folder in svunit.runFolders

Example test tree:
* runFolder1
  * rtl_unit_test.sv
    * test_1
	* test_2
  * other_unit_test.sv
    * test_3
* runFolder2
  * another_unit_test.sv
    * test_4
