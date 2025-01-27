# Test Provider for SVUnit

Runs SVUnit and collects results in the Test Provider API. SVUnit must be installed separately.

## VS Code API

If certain tests are select to be included, or excluded (by hiding the test), runSVUnit will be called with an appropriate `-t` and `--filter` options. These are substituted for `$TEST_SELECT` in the runCommands setting.

The simulator can be changed by setting: `svunit.simulator`

The run command can be set for each simulator setting in `svunit.runCommands`. The command will be launched inside a shell as `/bin/sh -c '$COMMAND'`.

For each folder under the project folder which contains one or more `*_unit_test.sv` files, a test group will be created. `svunit.runCommands` will be run in each of the folders when the "Run all tests" button is chosen, or in just one of the folders if a lower level run is selected.

## Example test tree:
* svunitFolder1/
  * rtl_unit_test.sv
    * test_1
    * test_2
  * other_unit_test.sv
    * test_3
* svunitFolder2/
  * another_unit_test.sv
    * test_4

## Screenshots
![Screenshot](images/screenshot1.png)