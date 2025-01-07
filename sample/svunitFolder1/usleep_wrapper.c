// usleep_wrapper.c
#include <unistd.h>

extern "C" void mysleep(double seconds) {
    usleep(1e6 * seconds);
}
