jquery.imagestream
==================
Image Stream is a jQuery UI widget that can display and animate a sequence of images on the web.

Rather than preload all of the images at the beginning, images are dynamically loaded on demand, with some buffering only when starting to play the animation. One particularly nifty feature is the ability to supply multiple versions of the image sequence,
with different resolutions, which Image Stream automatically swaps in and out as slower network conditions require (somewhat like adaptive bitrate streaming for video), or as you change the size of the image (good if you are strapping on some sort of zooming functionality).

Dependencies
------------
jQuery and jQuery UI (or more specifically the jQuery UI widget factory) must be sourced on the same page before this plugin.
Image Stream was specifically built and tested on jQuery 2.0.2 and jQuery UI 1.10.3, and further testing may soon follow, but for now jQuery 1.9.x and jQuery UI 1.10.x should work fine.

Image Stream also relies on the HTML5 Canvas and so may not work on some older browsers.

How to Use
----------
Load jQuery, jQuery UI, and Image Stream. Some smart people have recommended placing the script tags at the bottom of your document body.

```html
<script src="http://code.jquery.com/jquery-1.9.1.js"></script>
<script src="http://code.jquery.com/ui/1.10.3/jquery-ui.js"></script>
<script src="/your/path/to/jquery.imagestream.js"></script>
```

Initialize the plugin on your container element, with an object containing the options.

```js
$container.imageStream({
    sequences: [
        function (frame) { return 'ani/img_large_' + frame + '.jpg'; },
        function (frame) { return 'ani/img_small_' + frame + '.jpg'; }
        ],
    fps: 12,
    numFrames: 200,
    containerSize: {width: 500, height: 500px},
});
```

Options
-------
Image Stream comes with a set of default options, as specified below.
You can easily override them (and are in fact encouraged to) by passing in options at initialization as shown above, or through the "option" method.

```js
imageStream.options = {
      // The array of image path definitions, ordered from highest resolution to lowest (though 
      // Image Stream wouldn't know the difference).
      // Each definition is either in the form of a callback function--which takes a zero-indexed frame number
      // as an integer and returns a string--or an explicit array of strings.
      sequences: [],
      // The number of frames in the animation. Must be specified if using a callback function for 
      // sequence definition, otherwise defaults to the length of the first explicit list.
      numFrames: null,
      // The size of the container. This value should be an object with numeric "width" and "height" properties.
      // Defaults to the CSS size of the element right before initialization of Image Stream. 
      containerSize: null,
      // Size of the images inside the container. Same format as containerSize.
      // Defaults to the size of the container element after the above defaults are applied.
      size: null,
      // Offset of the images inside the container. This value should be an boject with numeric "x" and "y"
      // properties.
      offset: {x: 0, y: 0},
      // The frame to display first (zero-indexed).
      frame: 0,
      // The speed of the animation in frames per second.
      fps: 12,
      // The maximum number of images to keep in buffer at any given time. Can be arbitrarily large.
      maxBufferSize: 20,
      // The minimum number of images to buffer before starting animation on play.
      minBufferSize: 10,
      // If true, will apply adaptive streaming, otherwise, stay on the same sequence throughout animation.
      adaptive: true,
      // Callback function that returns the index of the sequence to switch to given a new image width after resize.
      // Default always uses first sequence in sequences array.
      sequenceByWidth: function (imageWidth) {
          return 0;
      },
      // ADVANCED: Number of milliseconds to wait after resizing the images to detect need for sequence change. 
      resizeWait: 500
}
```

Methods
-------
Methods are called by passing the method name to Image Stream, followed by the method arguments.

All frame indices should be specified in zero-indexed form.

### `option([optionName[, optionValue]])`

  1. `optionName` _{String}_: The name of the option to get/set.
  2. `optionValue` _{?}_: The target value of the option.

If only an option name is specified, return the current value of that option.
If an option value is also specified, set that option to the new value.

```js
// Resize container to 512px by 512px
$elem.imageStream("option", "containerSize", {width: 512, height: 512});
```

### `play([from[, to]])`

__Arguments__

  1. `from` _{Number}_: The frame from which to start the animation. Defaults to the current frame, or the first frame if the current frame is the last frame.
  2. `to` _{Number}_: The frame at which to end the animation. Defaults to the last frame.

```js
// Play from frame 12 (the 13th frame).
$elem.imageStream("play", 12);
```

Play the animation.

### `pause()`

```js
$elem.imageStream("pause");
```

Pause the animation.

### `next()`

```js
$elem.imageStream("next");
```

Step to the next frame. If animation is playing, animation will pause.

### `previous()`

```js
$elem.imageStream("previous");
```

Step to the previous frame. If animation is playing, animation will pause.

### `frame(target)`

  1. `from` _{Number}_: The target frame.

```js
// Jump to frame 12 (the 13th frame).
$elem.imageStream("frame", 12);
```

Jump to the target frame. If animation is playing, animation will pause.

Events
------

### `"play"`

__Arguments Received__

  1. `e` _(jQuery.Event)_: jQuery event object

Fired when animation starts.

### `"pause"`

__Arguments Received__

  1. `e` _(jQuery.Event)_: jQuery event object

Fired when animation stops/pauses.

### `"buffering"`

__Arguments Received__

  1. `e` _(jQuery.Event)_: jQuery event object

Fired when animation stops to wait for images to buffer.

### `"frameChange"`

__Arguments Received__

  1. `e` _(jQuery.Event)_: jQuery event object
  2. `frame` _(Number)_: The index of the newly displayed frame.

Fired when a new frame is displayed.

