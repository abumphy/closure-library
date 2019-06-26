// Copyright 2019 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview A full ponyfill of the ReadableStream native API.
 */

goog.module('goog.streams.full');

const lite = goog.require('goog.streams.lite');
const {assert, assertNumber} = goog.require('goog.asserts');

/**
 * The underlying source for a ReadableStream.
 * @template T
 * @record
 * @extends {lite.ReadableStreamUnderlyingSource}
 */
class ReadableStreamUnderlyingSource {
  constructor() {
    /**
     * A pull method that is called when the ReadableStream's internal queue
     * becomes not full.
     * @type {(function(!ReadableStreamDefaultController<T>):
     *     (!Promise<undefined>|undefined))|undefined}
     */
    this.pull;

    /**
     * Called when the ReadableStream is cancelled.
     * @type {(function(*): (!Promise<undefined>|undefined))|undefined}
     */
    this.cancel;
  }
}

/**
 * The strategy for the ReadableStream queue.
 * @template T
 * @record
 */
class ReadableStreamStrategy {
  constructor() {
    /**
     * A sizing algorithm that takes a chunk of the ReadableStream and returns
     * a size.
     * https://streams.spec.whatwg.org/#qs-api
     * @type {(function(T): number)|undefined}
     */
    this.size;

    /**
     * Used to calculate the desired size of the ReadableStream. The high-water
     * mark minus the sum of the sizes of chunks currently in the queue is the
     * desired size.
     * https://streams.spec.whatwg.org/#qs-api
     * @type {number|undefined}
     */
    this.highWaterMark;
  }
}

/**
 * @typedef {function(!ReadableStreamDefaultController):
 * (!Promise<undefined>|undefined)}
 */
let StartAlgorithm;

/** @typedef {function(*): !Promise<undefined>} */
let CancelAlgorithm;

/**
 * @typedef {function(!ReadableStreamDefaultController): !Promise<undefined>}
 */
let PullAlgorithm;

/**
 * The implemenation of ReadableStream.
 * @template T
 */
class ReadableStream extends lite.ReadableStream {
  /** @package */
  constructor() {
    super();

    /** @package {boolean} */
    this.disturbed = false;
  }

  /**
   * Returns a ReadableStreamDefaultReader that enables reading chunks from
   * the source.
   * https://streams.spec.whatwg.org/#rs-get-reader
   * @return {!ReadableStreamDefaultReader<T>}
   * @override
   */
  getReader() {
    return this.reader = new ReadableStreamDefaultReader(this);
  }

  /**
   * Cancels the ReadableStream with an optional reason.
   * https://streams.spec.whatwg.org/#rs-cancel
   * @param {*} reason
   * @return {!Promise<undefined>}
   */
  cancel(reason) {
    if (this.locked) {
      return Promise.reject(new TypeError('Cannot cancel a locked stream'));
    }
    return this.cancelInternal(reason);
  }

  /**
   * @param {*} reason
   * @return {!Promise<undefined>}
   * @package
   */
  cancelInternal(reason) {
    this.disturbed = true;
    if (this.state === lite.ReadableStream.State.CLOSED) {
      return Promise.resolve();
    }
    if (this.state === lite.ReadableStream.State.ERRORED) {
      return Promise.reject(this.storedError);
    }
    this.close();
    return /** @type {!ReadableStreamDefaultController} */ (
               this.readableStreamController)
        .cancelSteps(reason)
        .then(() => {});
  }
}

/**
 * Creates and returns a new ReadableStream.
 *
 * The underlying source should only have a start() method, and no other
 * properties.
 * @param {!ReadableStreamUnderlyingSource<T>=} underlyingSource
 * @param {!ReadableStreamStrategy<T>=} strategy
 * @return {!ReadableStream<T>}
 * @suppress {strictMissingProperties}
 * @template T
 */
function newReadableStream(underlyingSource = {}, strategy = {}) {
  const verifyObject =
      /** @type {!Object} */ (underlyingSource);
  assert(
      !(verifyObject.type),
      `'type' property not allowed on an underlying source for a ` +
          'lite ReadableStream');
  assert(
      !(verifyObject.autoAllocateChunkSize),
      `'autoAllocateChunkSize' property not allowed on an underlying ` +
          'source for a lite ReadableStream');
  const startAlgorithm = underlyingSource.start ?
      (controller) => underlyingSource.start(controller) :
      () => {};
  const cancelAlgorithm = underlyingSource.cancel ? (reason) => {
    try {
      return Promise.resolve(underlyingSource.cancel(reason));
    } catch (e) {
      return Promise.reject(e);
    }
  } : undefined;
  const pullAlgorithm = underlyingSource.pull ? (controller) => {
    try {
      return Promise.resolve(underlyingSource.pull(controller));
    } catch (e) {
      return Promise.reject(e);
    }
  } : undefined;
  const highWaterMark =
      strategy.highWaterMark === undefined ? 1 : strategy.highWaterMark;
  const sizeAlgorithm = strategy.size ?
      (chunk) => strategy.size.call(undefined, chunk) :
      undefined;
  const stream = new ReadableStream();
  const controller = new ReadableStreamDefaultController(
      stream, cancelAlgorithm, pullAlgorithm, highWaterMark, sizeAlgorithm);
  stream.readableStreamController = controller;
  controller.start(startAlgorithm);
  return stream;
}

/**
 * The DefaultReader for a ReadableStream. Adds cancellation onto the lite
 * DefaultReader.
 * @template T
 */
class ReadableStreamDefaultReader extends lite.ReadableStreamDefaultReader {
  /**
   * Cancels the ReadableStream with an optional reason.
   * https://streams.spec.whatwg.org/#default-reader-cancel
   * @param {*} reason
   * @return {!Promise<undefined>}
   */
  cancel(reason) {
    if (!this.ownerReadableStream) {
      return Promise.reject(new TypeError(
          'This readable stream reader has been released and cannot be used ' +
          'to cancel its previous owner stream'));
    }
    return /** @type {!ReadableStream} */ (this.ownerReadableStream)
        .cancelInternal(reason);
  }
}

/**
 * The controller for a ReadableStream. Adds cancellation and backpressure onto
 * the lite DefaultController.
 * @template T
 */
class ReadableStreamDefaultController extends
    lite.ReadableStreamDefaultController {
  /**
   * @param {!ReadableStream} stream
   * @param {!CancelAlgorithm|undefined} cancelAlgorithm
   * @param {!PullAlgorithm|undefined} pullAlgorithm
   * @param {number} strategyHWM
   * @param {(function(T): number)|undefined} strategySizeAlgorithm
   * @package
   */
  constructor(
      stream, cancelAlgorithm, pullAlgorithm, strategyHWM,
      strategySizeAlgorithm) {
    super(stream);

    /** @private {!CancelAlgorithm|undefined} */
    this.cancelAlgorithm_ = cancelAlgorithm;

    /** @private {boolean} */
    this.pullAgain_ = false;

    /** @private {!PullAlgorithm|undefined} */
    this.pullAlgorithm_ = pullAlgorithm;

    /** @private {boolean} */
    this.pulling_ = false;

    /** @private {number} */
    this.queueTotalSize_ = 0;

    /** @private {boolean} */
    this.started_ = false;

    /** @private @const {number} */
    this.strategyHWM_ = strategyHWM;

    /** @private {(function(T): number)|undefined} */
    this.strategySizeAlgorithm_ = strategySizeAlgorithm;

    /** @private @const {!QueueWithSizes<T>} */
    this.queueWithSizes_ = new QueueWithSizes(this.queue);
  }

  /**
   * Returns the desired size to fill the controlled stream's internal queue. It
   * can be negative if the queue is full.
   * https://streams.spec.whatwg.org/#rs-default-controller-desired-size
   * @return {?number}
   */
  get desiredSize() {
    return this.getDesiredSize_();
  }

  /** @override */
  started() {
    this.started_ = true;
    this.callPullIfNeeded();
  }

  /** @override */
  callPullIfNeeded() {
    if (!this.pullAlgorithm_ || !this.shouldCallPull_()) {
      return;
    }
    if (this.pulling_) {
      this.pullAgain_ = true;
      return;
    }
    this.pulling_ = true;
    this.pullAlgorithm_(this).then(
        () => {
          this.pulling_ = false;
          if (this.pullAgain_) {
            this.pullAgain_ = false;
            this.callPullIfNeeded();
          }
        },
        (error) => {
          this.error(error);
        });
  }

  /**
   * @return {boolean}
   * @private
   */
  shouldCallPull_() {
    if (!this.canCloseOrEnqueue()) {
      return false;
    }
    if (!this.started_) {
      return false;
    }
    if (this.controlledReadableStream.locked &&
        this.controlledReadableStream.getNumReadRequests() > 0) {
      return true;
    }
    return assertNumber(this.getDesiredSize_()) > 0;
  }

  /** @override */
  clearAlgorithms() {
    this.cancelAlgorithm_ = undefined;
    this.pullAlgorithm_ = undefined;
    this.strategySizeAlgorithm_ = undefined;
  }

  /**
   * @param {*} reason
   * @return {!Promise<*>}
   * @package
   */
  cancelSteps(reason) {
    this.queue.resetQueue();
    const cancelResult = this.cancelAlgorithm_ ? this.cancelAlgorithm_(reason) :
                                                 Promise.resolve();
    this.clearAlgorithms();
    return cancelResult;
  }

  /** @override */
  enqueueIntoQueue(chunk) {
    let size;
    try {
      // Default to size of 1 if no algorithm is specified.
      size = Number(
          this.strategySizeAlgorithm_ ? this.strategySizeAlgorithm_(chunk) : 1);
    } catch (e) {
      this.error(e);
      throw e;
    }
    if (typeof size !== 'number' || Number.isNaN(size) || size < 0 ||
        size === Infinity) {
      throw new RangeError(
          `The return value of a queuing strategy's size function must be a` +
          ' finite, non-NaN, non-negative number');
    }
    this.queueTotalSize_ += size;
    this.queueWithSizes_.enqueueValueWithSize(chunk, size);
  }

  /** @override */
  dequeueFromQueue() {
    const {value, size} = this.queueWithSizes_.dequeueValueWithSize();
    this.queueTotalSize_ -= size;
    if (this.queueTotalSize_ < 0) {
      // This might be less than zero due to rounding errors.
      this.queueTotalSize_ = 0;
    }
    return value;
  }

  /** @override */
  resetQueue() {
    this.queueWithSizes_.resetQueue();
  }

  /**
   * @return {?number}
   * @private
   */
  getDesiredSize_() {
    if (this.controlledReadableStream.state ===
        lite.ReadableStream.State.ERRORED) {
      return null;
    }
    if (this.controlledReadableStream.state ===
        lite.ReadableStream.State.CLOSED) {
      return 0;
    }
    return this.strategyHWM_ - this.queueTotalSize_;
  }
}

/**
 * An internal Queue representation that wraps a queue and has a size associated
 * with each chunk.
 * @template T
 * @package
 */
class QueueWithSizes {
  /**
   * @param {!lite.Queue} queue
   */
  constructor(queue) {
    /**
     * @private @const {!lite.Queue}
     */
    this.queue_ = queue;

    /**
     * @private {!Array<number>}
     */
    this.sizes_ = [];
  }

  /**
   * @param {T} chunk
   * @param {number} size
   */
  enqueueValueWithSize(chunk, size) {
    this.queue_.enqueueValue(chunk);
    this.sizes_.push(size);
  }

  /**
   * @return {{value: T, size: number}}
   */
  dequeueValueWithSize() {
    return {
      value: this.queue_.dequeueValue(),
      size: this.sizes_.shift(),
    };
  }

  /**
   * @return {void}
   */
  resetQueue() {
    this.queue_.resetQueue();
    this.sizes_ = [];
  }
}

exports = {
  ReadableStream,
  ReadableStreamDefaultController,
  ReadableStreamDefaultReader,
  ReadableStreamStrategy,
  ReadableStreamUnderlyingSource,
  newReadableStream,
};
