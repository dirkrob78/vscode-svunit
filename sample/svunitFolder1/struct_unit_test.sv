`include "svunit_defines.svh"

module struct_unit_test;
  import svunit_pkg::svunit_testcase;
  string name = "struct_ut"; 
  svunit_testcase svunit_ut;


  //===================================
  // This is the UUT that we're 
  // running the Unit Tests on
  //===================================

  `CLK_RESET_FIXTURE(5, 11)

  reg a, b;
  wire ab, Qab;
  rtl my_rtl(.*);


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

    reset();
  endtask


  //===================================
  // Here we deconstruct anything we 
  // need after running the Unit Tests
  //===================================
  task teardown();
    svunit_ut.teardown();
    /* Place Teardown Code Here */

  endtask


  //===================================
  // All tests are defined between the
  // SVUNIT_TESTS_BEGIN/END macros
  //
  // Each individual test must be
  // defined between `SVTEST(_NAME_)
  // `SVTEST_END
  //
  // i.e.
  //   `SVTEST(mytest)
  //     <test code>
  //   `SVTEST_END
  //===================================
  `SVUNIT_TESTS_BEGIN
  // Define the structs
typedef struct {
    int field1;
    real field2;
} simple_struct_t;

`SVTEST(test_real_equality)
    real x, y;
    x = 1.1;
    y = 2.2;
    `FAIL_UNLESS_EQUAL(x, y);
`SVTEST_END

//---------------------------------
// Test equality of two simple structs
//---------------------------------
`SVTEST(test_struct_equality_should_fail)
    simple_struct_t struct1;
    simple_struct_t struct2;

    // Initialize the structs
    struct1.field1 = 10;
    struct1.field2 = 1.1;

    struct2.field1 = 11;
    struct2.field2 = 2.2;

    $display(struct2.field2);

    // Compare the structs
    $display("Testing structure equality");
    $display("should fail");
    `FAIL_UNLESS_EQUAL(struct1, struct2);
`SVTEST_END

`SVTEST(test_struct_equality_should_pass)
    simple_struct_t struct1;
    simple_struct_t struct2;

    // Initialize the structs
    struct1.field1 = 10;
    struct1.field2 = 20.0/7;

    struct2.field1 = 10;
    struct2.field2 = 20.0/7;

    // Compare the structs
    $display("Testing structure equality");
    $display("should pass");
    `FAIL_UNLESS_EQUAL(struct1, struct2);
`SVTEST_END


`SVUNIT_TESTS_END

endmodule
