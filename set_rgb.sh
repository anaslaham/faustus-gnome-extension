#!/bin/bash

# Red [00 - ff]
echo $1 > /sys/devices/platform/faustus/kbbl/kbbl_red
# Green [00 - ff]
echo $2 > /sys/devices/platform/faustus/kbbl/kbbl_green
# Blue [00 - ff]
echo $3 > /sys/devices/platform/faustus/kbbl/kbbl_blue
# Mode: 0 - static color, 1 - breathe, 2 - auto color cycle, 3 - strobe
echo $4 > /sys/devices/platform/faustus/kbbl/kbbl_mode
# Speed for modes 1 and 2: 0 - slow, 1 - medium, 2 - fast
echo $5 > /sys/devices/platform/faustus/kbbl/kbbl_speed
#Is controlled by default by the driver itself when Fn-F5 is pressed switching three modes
echo $6 > /sys/devices/platform/faustus/throttle_thermal_policy
# Enable: 02 - on boot (before module load) | 08 - awake | 20 - sleep (2a or ff to set all)
echo 2a > /sys/devices/platform/faustus/kbbl/kbbl_flags
# Save: 1 - permanently, 2 - temporarily (reset after reboot)
echo 1 > /sys/devices/platform/faustus/kbbl/kbbl_set