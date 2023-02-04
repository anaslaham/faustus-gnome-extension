'use strict';

//Basics
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;
const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

//Ui Elements
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const Me = ExtensionUtils.getCurrentExtension();

class Utils {
    static runCommand(command) {
        try {
            let [, stdout, stderr, status] = GLib.spawn_command_line_sync(command);

            if (status !== 0) {
                if (stderr instanceof Uint8Array)
                    stderr = ByteArray.toString(stderr);

                throw new Error(stderr);
            }

            if (stdout instanceof Uint8Array)
                stdout = ByteArray.toString(stdout);

            return stdout;
        } catch (e) {
            console.error(e);
        }
    }
    static hexToDecimal(hex) {
        return Math.floor(parseInt(hex, 16));
    }

    static decimalToHex(decimal) {
        decimal = Math.floor(decimal);
        return decimal.toString(16).padStart(2, '0');
    }
}

class Faustus {
    DRIVER_PATH = '/sys/devices/platform/faustus/';
    FAN_MODE_PATH = 'throttle_thermal_policy';
    COLOR_PATH_PREFIX = 'kbbl/';
    COLORS = ['red', 'green', 'blue'];

    constructor() {
        this.pkexec_path = GLib.find_program_in_path('pkexec');
        this.color = {};
        this.fanMode = 0;
        this.animationSpeed = 0;
        this.animationMode = 0;
        this.checkKernelModule();
        this.readValues();
    }

    //Check if the kernel module for the driver is loaded
    checkKernelModule() {
        const modules = Utils.runCommand('lsmod');
        if (!modules.includes('faustus')) {
            throw new Error('Faustus driver not installed please check https://github.com/hackbnw/faustus for installation')
        }
    }

    //Read values from drivers check https://github.com/hackbnw/faustus
    readValues() {
        this.fanMode = parseInt(Utils.runCommand(`cat ${this.DRIVER_PATH}${this.FAN_MODE_PATH}`));
        this.animationSpeed = parseInt(Utils.runCommand(`cat ${this.DRIVER_PATH}${this.COLOR_PATH_PREFIX}kbbl_speed`));
        this.animationMode = parseInt(Utils.runCommand(`cat ${this.DRIVER_PATH}${this.COLOR_PATH_PREFIX}kbbl_mode`));
        this.COLORS.forEach(c => {
            this.color[c] = Utils.hexToDecimal(Utils.runCommand(`cat ${this.DRIVER_PATH}${this.COLOR_PATH_PREFIX}kbbl_${c}`));
        })
    }
    //sets one of the colors
    setColor(color, value) {
        if (this.COLORS.includes(color) && typeof value === 'number' && value >= 0 && value <= 255) {
            //Update color property
            this.color[color] = value;
        }
    }
    //Sets the fan mode
    setFanMode(value) {
        if (value >= 0 && value <= 2) {
            this.fanMode = value;
            this.save();
        }
    }
    //Sets the animation speed
    setAnimationSpeed(value) {
        if (value >= 0 && value <= 2) {
            this.animationSpeed = value;
            this.save()
        }
    }
    //Sets the animation mode
    setAnimationMode(value) {
        if (value >= 0 && value <= 3) {
            this.animationMode = value;
            this.save()
        }
    }
    //Save the results
    save() {
        Util.trySpawnCommandLine(`${this.pkexec_path} ${Me.path}/set_rgb.sh ${this.COLORS.map(c => Utils.decimalToHex(this.color[c])).join(' ')} ${this.animationMode} ${this.animationSpeed} ${this.fanMode}`);
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(number, base) {
        super(number / base);
        this.base = base;
        this.step = base > 1 ? 1 / base : 0.01;
    }

    get numb() {
        return this.value * this.base;
    }

    set numb(number) {
        this.value = number / this.base;
    }

    vfunc_key_press_event(event) {
        let key = event.keyval;
        if (key === Clutter.KEY_Right || key === Clutter.KEY_Left) {
            let delta = key === Clutter.KEY_Right ? this.step : -this.step;
            this.value = Math.max(0, Math.min(this._value + delta, this._maxValue));
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }

    scroll(event) {
        if (event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        let delta = (direction => {
            switch (direction) {
                case Clutter.ScrollDirection.UP: return 1;
                case Clutter.ScrollDirection.DOWN: return -1;
                case Clutter.ScrollDirection.SMOOTH: return -event.get_scroll_delta()[1];
                default: return 0;
            }
        })(event.get_scroll_direction());
        this.value = Math.min(Math.max(0, this._value + delta * this.step), this._maxValue);
        return Clutter.EVENT_STOP;
    }
}

class SliderMenuItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, number, base, callback) {
        super({ activate: false });
        let label = new St.Label({ text, x_expand: false });
        this._slider = new ColorSlider(number, base);
        this._slider.connect('notify::value', () => (this._slider._dragging || this.active) && callback(this._slider.numb));
        this.connect('button-press-event', (_a, event) => this._slider.startDragging(event));
        this.connect('key-press-event', (_a, event) => this._slider.emit('key-press-event', event));
        this.connect('scroll-event', (_a, event) => this._slider.emit('scroll-event', event));
        [label, this._slider].forEach(x => this.add_child(x));
    }

    setNumber(number) {
        this._slider.numb = number;
    }
}


var controlMenu = GObject.registerClass({
    GTypeName: 'faustusControlMenu',
}, class ControlMenu extends PanelMenu.Button {
    _init() {
        super._init(St.Align.START);
        this.faustus = new Faustus();
        this.ICONS = {
            fan: 'fan-symbolic.svg',
            speed: 'speed-gauge.svg',
            mode: 'preferences-color-symbolic.svg',
            panel: 'input-gaming-symbolic.svg'
        }
        this.FAN_MODES = ['Balanced', 'Turbo', 'Silent'];
        this.ANIMATION_MODES = ['Static color', 'Breathing', 'Color cycle', 'Strobe'];
        this.ANIMATION_SPEEDS = ['Slow', 'Medium', 'Fast'];

        this.icon = new St.Icon()
        this.icon.gicon = Gio.icon_new_for_string(Me.path + '/icons/' + this.ICONS.panel);

        this.actor.add_actor(this.icon);
        this._drawMenu();

    };

    _redrawMenu() {
        this.menu.removeAll();
        this._drawMenu();
    }

    _drawMenu() {
        // add menu items
        this.menu.addMenuItem(new PopupMenu.PopupImageMenuItem('Keyboard Color', "keyboard-brightness-symbolic", {}));
        //Add keyboard color Sliders
        this.faustus.COLORS.forEach((c) => {
            this.menu.addMenuItem(new SliderMenuItem(c.slice(0, 1).toUpperCase(), this.faustus.color[c], 255, colorValue => this.faustus.setColor(c, colorValue)));
        });
        //Apply Color Button
        const setColorItem = new PopupMenu.PopupImageMenuItem('Apply Color', 'object-select-symbolic', {});
        this.menu.addMenuItem(setColorItem);
        setColorItem.actor.connect('button_press_event', () => {
            this.faustus.save();
            this._redrawMenu();
        });

        //add separator menu
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem);

        //Color modes
        const colorModeMenuItem = new PopupMenu.PopupSubMenuMenuItem('Color Mode', true, {});
        // Icon
        colorModeMenuItem.icon.gicon = Gio.icon_new_for_string(Me.path + '/icons/' + this.ICONS.mode);
        // Actions
        this.ANIMATION_MODES.forEach((m, i) => colorModeMenuItem.menu.addAction(m, () => { this.faustus.setAnimationMode(i); this._redrawMenu(); }, i === this.faustus.animationMode ? 'object-select-symbolic' : undefined));

        this.menu.addMenuItem(colorModeMenuItem);

        //Animation speed
        const AnimationSpeedMenuItem = new PopupMenu.PopupSubMenuMenuItem('Animation Speed', true, {});
        // Icon
        AnimationSpeedMenuItem.icon.gicon = Gio.icon_new_for_string(Me.path + '/icons/' + this.ICONS.speed);
        // Actions
        this.ANIMATION_SPEEDS.forEach((s, i) => AnimationSpeedMenuItem.menu.addAction(s, () => { this.faustus.setAnimationSpeed(i); this._redrawMenu(); }, i === this.faustus.animationSpeed ? 'object-select-symbolic' : undefined));

        this.menu.addMenuItem(AnimationSpeedMenuItem);

        // Fan Mode
        const FanModeMenuItem = new PopupMenu.PopupSubMenuMenuItem('Fan Mode', true, {});
        //Icon
        FanModeMenuItem.icon.gicon = Gio.icon_new_for_string(Me.path + '/icons/' + this.ICONS.fan);
        // Actions
        this.FAN_MODES.forEach((f, i) => FanModeMenuItem.menu.addAction(f, () => { this.faustus.setFanMode(i); this._redrawMenu(); }, i === this.faustus.fanMode ? 'object-select-symbolic' : undefined));

        this.menu.addMenuItem(FanModeMenuItem);
    }
})

let menu;

class Extension {
    constructor() {
        this._indicator = null;
    }

    enable() {
        menu = new controlMenu();
        Main.panel.addToStatusArea('indicator', menu);
    }

    disable() {
        menu.destroy();
    }
}


function init() {
    return new Extension();
}