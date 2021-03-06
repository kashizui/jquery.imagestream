/**
 * jQuery Image Stream Widget
 * @author Stephen Koo
 * @version 0.1.1
 **/
(function ($) {
    "use strict";

    $.widget("remotebio.imageStream", {

        // Default options
        options: {
            // The array of image path definitions, ordered from highest resolution to lowest (though 
            // Image Stream wouldn't know the difference).
            // Each definition is either in the form of a callback function--which takes a zero-indexed frame number
            // as an integer and returns a string--or an explicit array of strings.
            sequences: [],
            // Average file sizes of the images for each sequence, in bytes.
            bytes: [],
            // Path to placeholder image, which is displayed when frame is set to -1.
            placeholder: "/placeholder.png",
            // The number of frames in the animation. Must be specified if using a callback function for 
            // sequence definition, otherwise defaults to the length of the first explicit list.
            numFrames: null,
            // The size of the container. This value should be an object with numeric "width" and "height" properties.
            // Defaults to the CSS size of the element right before initialization of Image Stream. 
            containerSize: null,
            // Size of the images inside the container. Same format as containerSize.
            // Defaults to the size of the container element after the above defaults are applied.
            size: null,
            // Offset of the images inside the container. This value should be an object with numeric "x" and "y"
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
        },

        _create: function () {
            // Prepare internal (private) state object
            this._state = {
                "$bufferContainer": $("<div></div>").hide().appendTo(this.element),
                "$currentImage": $("<img />"),
                "bufferSize": 0,
                "sequence": Infinity,
                "buffer": {},
                "playing": false,
                "aniTimer": null,
                "resizeTimer": null,
                "$canvas": null,
                "ctx": null,
                "dlSpeed": Infinity,
            };
            this._state.$canvas = $("<canvas></canvas").appendTo(this.element);
            this._state.ctx = this._state.$canvas.get(0).getContext('2d');

            // get current size of container if not specified in options
            if (this.options.containerSize === null) {
                this.options.containerSize = {
                    width: this.element.css("width"),
                    height: this.element.css("height")
                };
            }
            // default image size matches the container size
            if (this.options.size === null) { 
                this.options.size = this.options.containerSize;
            }

            // Process the sequence definitions
            var numSequences = this.options.sequences.length;
            for (var i = 0; i < numSequences; i++) {
                var sequence = this.options.sequences[i];
                
                if (typeof sequence === 'function') {
                    // naive test
                    var testPath = sequence(0);
                    if (typeof testPath !== 'string') {
                        throw new Error("The callback function must accept an integer as argument and return a string.");
                    }
                    if (typeof this.options.numFrames !== 'number') {
                        throw new Error("numFrames must be specified if using a callback function for sequence definition.");
                    }
                } else if (sequence instanceof Array) {
                    if (this.options.numFrames == null) {
                        this.options.numFrames = sequence.length;
                    } else if (sequence.length < this.options.numFrames) {
                        throw new Error("The explicit array of images (sequences[" + i + "]) is smaller than the specified number of frames.");
                    }
                    // normalize into a function as well TODO: confirm that this works
                    this.options.sequences[i] = function getPath(frameNumber) {
                        return getPath.images[frameNumber];
                    };
                    this.options.sequences[i].images = sequence;
                } else {
                    throw new Error("Sequence must be an array of image paths or a callback function.");
                }

            }

            // Initialize sizes and load first image
            this._updateSequence();
            this._updateContainerSize();
            this._resetFrame();
        },

        _setOption: function(key, value) {
            if (value === undefined || value === null) {
                return this.options[key];
            }
            switch (key) {
            case "size":
                this.options[key] = value;
                this._refreshImage();
                // Reset timer to update sequence (if not in the middle of animation)
                if (!this._state.playing) {
                    window.clearTimeout(this._state.resizeTimer);
                    var self = this;
                    this._state.resizeTimer = window.setTimeout(function() {
                        self._updateSequence(null, true); // prevent downgrade
                    }, this.options.resizeWait);
                }
                break;
            case "offset":
                this.options[key] = value;
                this._refreshImage();
                break;
            case "frame":
                if (value !== this.options.frame && value >= -1 && value < this.options.numFrames) {
                    if (this._state.playing) {
                        this.pause();
                    }
                    this.options[key] = value;
                    this._updateSequence();
                    this._resetFrame();
                }
                break;
            case "containerSize":
                this.options[key] = value;
                this._updateContainerSize();
                this._refreshImage;
                break;
            case "numFrames":
                // First confirm that the sequences can be extended as specified.
                var numSequences = this.options.sequences.length;
                for (var i = 0; i < numSequences; i++) {
                    var sequence = this.options.sequences[i];
                    if (sequence.hasOwnProperty('images') && sequence.images.length < value) {
                        throw new Error("explicit array of images not big enough for new numFrames.");
                    }
                }
                this.options[key] = value;
                break;
            case "bytes":
            case "sequences":
                throw new Error("You cannot modify \"" + key + "\" after initialization.");
                break;
            default:
                this.options[key] = value;
                break;
            }
        },

        _updateSequence: function(newSequence, preventDowngrade) {
            // Calculate new sequence id based on width if none provided
            if (newSequence === undefined || newSequence === null) {
                newSequence = this.options.sequenceByWidth(this.options.size.width);
            }
            // Bound sequence id
            if (newSequence >= this.options.sequences.length) {
                newSequence = this.options.sequences.length - 1;
            } else if (newSequence < 0) {
                newSequence = 0;
            }
            // No need to let resolution decrease if better resolution image already loaded
            if (preventDowngrade && this._state.sequence < newSequence) {
                return false;
            }
            if (this._state.sequence === newSequence) {
                return false; // just return false if unchanged
            }
            
            // console.log("update to", newSequence);
            this._state.sequence = newSequence; 

            if (!this._state.playing) {
                this._resetFrame();
            }
            return true;
        },

        /*
         * Reset the buffer and reload the current frame from scratch.
         */
        _resetFrame: function() {
            // reset buffer
            this._state.$bufferContainer.empty();   
            this._state.bufferSize = 0;
            this._state.buffer = new Object();
            // load image
            this._loadImage(this.options.frame);
            this._joinImageLoad(this.options.frame, function() {
                this._displayFrame();
            });
        },

        /* 
         * Display the current frame.
         * Assumes that the image for the current frame has already been loaded.
         */
        _displayFrame: function() {
            // move image element out of buffer into $currentImage
            var $img = this._state.buffer[this.options.frame];
            delete this._state.buffer[this.options.frame]; 
            this._state.$currentImage.remove(); // remove last displayed image from document
            this._state.$currentImage = $img;
            this._state.bufferSize--;    // decrement bufferSize
            // refresh with new image
            this._refreshImage();
            // trigger frameChange event
            this.element.trigger("frameChange", this.options.frame);
        },

        /*
         * Fires a request to preload an image and places the new image element in the buffer.
         */
        _loadImage: function(seqNum) {
            var state = this._state;
            var options = this.options;

            if (state.buffer[seqNum]) {
                return; // if already in buffer, ignore load request.
            }

            var $img = $(new Image());

            // Set "done" flag when image is done loading
            var startTime = new Date().getTime(); // we don't need anything better than 15 ms precision
            var seq = state.sequence; // save current sequence
            $img.on("load", function() {
                state.dlSpeed = options.bytes[seq] / (new Date().getTime() - startTime);
                $img.data("done", true);
            });
            // Preload image
            if (seqNum === -1) {
                $img.attr("src", options.placeholder);
            } else {
                $img.attr("src", options.sequences[seq](seqNum));
            }
            // force some recalcitrant browsers to actually load the images by setting a size
            $img.css({height:"1px", width:"1px"}).data("done", false);

            // "cache" in a container
            state.$bufferContainer.append($img);
            state.buffer[seqNum] = $img;
            state.bufferSize++;
        },

        /*
         * Call the callback immediately if the given frame has already been loaded, 
         * or bind it to be called when the image is loaded.
         *
         * The callback receives an additional argument representing whether the callback was delayed,
         * which is "true" in the latter case outlined above and false in the former.
         */
        _joinImageLoad: function(seqNum, callback) {
            var $img = this._state.buffer[seqNum];

            if ($img) {
                if ($img.data("done") === true) {
                    callback.call(this, false);
                } else {
                    var self = this;
                    $img.on("load", function() {
                        callback.call(self, true);
                    });
                }
            } else {
                throw new Error("loadImage has not been called on " + seqNum + " yet.");
            }
        },

        /*
         * Update the container element and canvas size.
         * Canvas will get erased if resized so _refreshImage should typically be called after this.
         */
        _updateContainerSize: function() {
            this._state.$canvas.attr(this.options.containerSize);
            this.element.css(this.options.containerSize);
        },

        /*
         * Redraw the current image based on the currently specified offset and size.
         */
        _refreshImage: function() {
            var offset = this.options.offset;
            var size = this.options.size;
            this._state.ctx.clearRect(0, 0, this._state.$canvas.width(), this._state.$canvas.height());
            this._state.ctx.drawImage(this._state.$currentImage[0], offset.x, offset.y, size.width, size.height);
        },

        /* Public Methods */

        /*
         * Play through the specified range of images as an animation.
         * If no range is specified, defaults are:
         *      from -  the current frame, or the beginning if current frame is last frame
         *      to - the last frame in the sequence
         */
        play: function(from, to) {
            var state, options, element, self,
                nextFrame, lastTime, frameInterval, speeds, numSpeeds, i, bufferEnd;

            state = this._state;
            options = this.options;
            element = this.element;
            self = this;

            // validation and defaults
            if (from === undefined || from === null) {
                nextFrame = options.frame + 1;
                from = (nextFrame >= options.numFrames) ? 0 : nextFrame;
            }
            if (to === undefined || to === null) {
                to = options.numFrames - 1;
            }

            // the meat
            element.trigger("play");
            state.playing = true;
            options.frame = from;
            lastTime = new Date().getTime();
            frameInterval = 1000 / options.fps;

            // Compute download speeds necessary based on current fps
            speeds = [];
            numSpeeds = options.bytes.length
            for (i = 0; i < numSpeeds; i++) {
                speeds.push(options.bytes[i] / frameInterval);
                // console.log(i, speeds[i]*(7.62939e-3), "Mbps");
            }

            // Fire off loading for the first maxBufferSize images.
            element.trigger("buffering");
            bufferEnd = Math.min(from + options.maxBufferSize - 1, to);
            for (i = from; i <= bufferEnd; i++) {
                this._loadImage(i);
            }
            waitBuffer(from, Math.min(from + options.minBufferSize - 1, to));

            // Helper functions
            /* Calls stepAnimation only after all the images in the specified range have been loaded. */
            function waitBuffer(waitStart, waitEnd) {
                if (waitStart === waitEnd) {
                    self._joinImageLoad(waitEnd, function () {
                        stepAnimation(false);
                    });
                } else {
                    self._joinImageLoad(waitStart, function() {
                        waitBuffer(waitStart + 1, waitEnd); // recursively wait for the next image
                    });
                }
            }
            /* Displays the current frame in the animation, continues firing off buffer requests, and then recurses after the next image or the buffer is loaded. */
            function stepAnimation(isDelayed) {
                var bufferEnd, i;

                self._displayFrame();
                if (options.frame < to) {
                    // fire off loaders to mabntain buffer
                    bufferEnd = Math.min(to, options.frame + options.maxBufferSize - state.bufferSize);
                    for (i = options.frame + state.bufferSize + 1; i <= bufferEnd; i++) {
                        self._loadImage(i);
                    }

                    // Wait until it's time for the next frame.
                    state.aniTimer = window.setTimeout(function() {
                        var idx;

                        options.frame++;
                        lastTime = new Date().getTime();

                        // Adaptive streaming computations
                        if (options.adaptive) {
                            if (numSpeeds) {
                                // console.log(state.dlSpeed*(7.62949e-3) + " Mbps");
                                // Determine appropriate resolution by download speed
                                for (idx = 0; idx < numSpeeds; idx++) {
                                    if (state.dlSpeed > speeds[idx]) break;
                                }

                                // resolution could be better XOR last image load delayed
                                if ((idx < state.sequence) !== isDelayed) {
                                    self._updateSequence(Math.max(options.sequenceByWidth(options.size.width), idx));
                                }

                            } else {
                                // dumb method:
                                // bump down resolution if hit end of buffer
                                if (isDelayed) self._updateSequence(state.sequence + 1);
                            }
                        }

                        self._joinImageLoad(options.frame, stepAnimation);

                    }, Math.max(0, frameInterval - (new Date().getTime() - lastTime)));
                } else {
                    self.pause();
                }
            }
        },

        /*
         * Stop any currently playing animation.
         */
        pause: function() {
            window.clearTimeout(this._state.aniTimer);
            this._state.playing = false;
            this.element.trigger("pause");
            this._updateSequence();
        },

        /* A few convenience methods for moving around images */
        next: function() {
            this._setOption("frame", this.options.frame + 1);
        },

        previous: function() {
            this._setOption("frame", this.options.frame - 1);
        },

        frame: function(seqNum) {
            this._setOption("frame", seqNum);
        }
    });


})(jQuery);
