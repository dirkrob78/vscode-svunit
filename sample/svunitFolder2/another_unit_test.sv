`include "svunit_defines.svh"

module another_unit_test;
  import svunit_pkg::svunit_testcase;

  string name = "another_ut";
  svunit_testcase svunit_ut;

  //===================================
  // Build
  //===================================
  function void build();
    svunit_ut = new(name);
  endfunction


  //===================================
  // Setup for running the Unit Tests
  //===================================
  task setup();
    svunit_ut.setup();
    /* Place Setup Code Here */
  endtask


  //===================================
  // Here we deconstruct anything we 
  // need after running the Unit Tests
  //===================================
  task teardown();
    svunit_ut.teardown();
    /* Place Teardown Code Here */
  endtask

  `SVUNIT_TESTS_BEGIN

     `SVTEST(test_should_pass)
       $display("This test should pass");
       `FAIL_IF(0);
     `SVTEST_END

     `SVTEST(test_should_fail)
       $display("This test should fail");
       `FAIL_IF(1);
     `SVTEST_END

  `SVUNIT_TESTS_END

endmodule
