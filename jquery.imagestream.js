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
            sequences: [ // provided in order from highest resolution to lowest
                // generate image paths by callback
                function (frameNumber) { return '/pics/hiphop/dancing' + frameNumber + '.jpg'; },
                // or provide an explicit list
                ["/pics/hiphop/dancing0.jpg", "/pics/hiphop/dancing1.jpg", "/pics/hiphop/dancing2.jpg"]
            ],
            numFrames: 10,
            frame: 0,
            fps: 12,
            containerSize: {width: 500, height: 500},
            size: null, // defaults to the size of the container element
            offset: {x: 0, y: 0},
            maxBufferSize: 20,
            minBufferSize: 10,
            resizeWait: 500,
            adaptive: true,
            sequenceByWidth: function (imageWidth) {
                return (imageWidth > 1000) ? 0 : 1;
            }

        },

        _create: function () {
            // Prepare internal (private) state object
            this._state = {
                "$bufferContainer": $("<div></div>").hide().appendTo(this.element),
                "$currentImage": $("<img />"),
                "bufferSize": 0,
                "sequence": -1,
                "buffer": {},
                "playing": false,
                "aniTimer": null,
                "resizeTimer": null,
                "$canvas": null,
                "ctx": null
            };
            this._state.$canvas = $("<canvas></canvas").appendTo(this.element);
            this._state.ctx = this._state.$canvas.get(0).getContext('2d');

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
                } else if (sequence instanceof Array) {
                    if (sequence.length < this.options.numFrames) {
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
            switch (key) {
            case "size":
                this.options[key] = value;
                this._refreshImage();
                // Reset timer to update sequence (if not in the middle of animation)
                if (!this._state.playing) {
                    window.clearTimeout(this._state.resizeTimer);
                    var self = this;
                    this._state.resizeTimer = window.setTimeout(function() {
                        self._updateSequence();
                    }, this.options.resizeWait);
                }
                break;
            case "offset":
                this.options[key] = value;
                this._refreshImage();
                break;
            case "frame":
                if (value !== this.options.frame && value >= 0 && value < this.options.numFrames) {
                    this.options[key] = value;
                    if (this._state.playing) {
                        this.pause();
                    }
                    this._resetFrame();
                }
                break;
            case "containerSize":
                this.options[key] = value;
                this._updateContainerSize();
                this._refreshImage;
                break;
            case "numFrames":
                var numSequences = this.options.sequences.length;
                for (var i = 0; i < numSequences; i++) {
                    var sequence = this.options.sequence[i];
                    if (sequence.hasOwnProperty('images') && sequence.images.length < value) {
                        throw new Error("explicit array of images not big enough for new numFrames.");
                    }
                }
                this.options[key] = value;
                break;
            case "sequences":
                throw new Error("You cannot modify the sequences definitions after initializing the image stream (yet).");
                break;
            default:
                this.options[key] = value;
                break;
            }
        },

        _updateSequence: function(newSequence) {
            // Calculate and normalize the new sequence id
            if (newSequence === undefined || newSequence === null) {
                newSequence = this.options.sequenceByWidth(this.options.size.width);
            }
            if (newSequence >= this.options.sequences.length) {
                newSequence = this.options.sequences.length - 1;
            } else if (newSequence < 0) {
                newSequence = 0;
            }
            if (this._state.sequence === newSequence) {
                return false; // just return false if unchanged
            }
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
            if (this._state.buffer[seqNum]) {
                return; // if already in buffer, ignore load request.
            }
            var $img = $(new Image());

            // Set "done" flag when image is done loading
            $img.on("load", function() {
                $img.data("done", true);
            });
            // Preload image
            // force some recalcitrant browsers to actually load the images by setting a size
            $img.attr("src", this.options.sequences[this._state.sequence](seqNum)).css({height:"1px", width:"1px"}).data("done", false);

            // "cache" in a container
            this._state.$bufferContainer.append($img);
            this._state.buffer[seqNum] = $img;
            this._state.bufferSize++;
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
                    callback.call(this, false /*isDelayed*/);
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
            this.element.trigger("play");
            this._state.playing = true;
            // validation and defaults
            if (from === undefined || from === null) {
                var nextFrame = this.options.frame + 1;
                from = (nextFrame >= this.options.numFrames) ? 0 : nextFrame;
            }
            if (to === undefined || to === null) {
                to = this.options.numFrames - 1;
            }

            // the meat
            var lastTime = new Date().getTime();
            this.options.frame = from;

            // Fire off loading for the first maxBufferSize images.
            this.element.trigger("buffering");
            var bufferEnd = Math.min(from + this.options.maxBufferSize - 1, to);
            for (var i = from; i <= bufferEnd; i++) {
                this._loadImage(i);
            }
            waitBuffer.call(this, from, Math.min(from + this.options.minBufferSize - 1, to));

            // Helper functions
            /* Calls stepAnimation only after all the images in the specified range have been loaded. */
            function waitBuffer(waitStart, waitEnd) {
                if (waitStart === waitEnd) {
                    this._joinImageLoad(waitEnd, stepAnimation);
                } else {
                    this._joinImageLoad(waitStart, function() {
                        waitBuffer.call(this, waitStart + 1, waitEnd); // recursively wait for the next image
                    });
                }
            }
            /* Displays the current frame in the animation, continues firing off buffer requests, and then recurses after the next image or the buffer is loaded. */
            function stepAnimation(isDelayed) {
                this._displayFrame();
                if (this.options.frame < to) {
                    // fire off loading if buffer is under maxBufferSize
                    bufferEnd = Math.min(to, this.options.frame + this.options.maxBufferSize - this._state.bufferSize);
                    for (var i = this.options.frame + this._state.bufferSize + 1; i <= bufferEnd; i++) {
                        this._loadImage(i);
                    }
                    // Calculate time left in the current frame interval
                    var elapsed = (new Date().getTime() - lastTime);
                    var frameInterval = 1000 / this.options.fps;
                    var timeLeft = (elapsed > frameInterval) ? 0 : frameInterval - elapsed;
                    // Wait for time for next frame
                    var self = this;
                    this._state.aniTimer = window.setTimeout(function() {
                        lastTime = new Date().getTime();
                        self.options.frame++;
                        if (isDelayed) {
                            // if hitting end of buffer, wait until it grows to minBufferSize if can't switch resolution,
                            // or switch to lower resolution and wait until all previously buffered higher resolution images are done loading
                            self.element.trigger("buffering");
                            if (self.options.adaptive && self._updateSequence(self._state.sequence + 1)) {
                                waitBuffer.call(self, self.options.frame, self.options.frame + self._state.bufferSize - 1);
                            } else {
                                waitBuffer.call(self, self.options.frame, Math.min(self.options.frame + self.options.minBufferSize - 1, to));
                            }
                        } else {
                            self._joinImageLoad(self.options.frame, stepAnimation);
                        }
                    }, timeLeft);
                } else {
                    this.pause();
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
