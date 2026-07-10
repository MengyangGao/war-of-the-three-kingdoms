/* ===========================================================================
 * 三分天下 · 可取消统一时间线
 *
 * 所有视觉延迟和帧回调都登记在命名 scope 中。重开、跳过演出或异常恢复时
 * 可以一次取消，并保证等待中的 Promise 得到释放。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var records = [];
  var Timeline = SGS.Timeline = {};

  function remove(record) {
    var index = records.indexOf(record);
    if (index >= 0) records.splice(index, 1);
  }

  Timeline.after = function (scope, ms, callback, onCancel) {
    var record = { scope: scope || 'default', kind: 'timer', id: null, onCancel: onCancel };
    record.id = setTimeout(function () {
      remove(record);
      callback();
    }, Math.max(0, ms || 0));
    records.push(record);
    return record;
  };

  Timeline.frame = function (scope, callback, onCancel) {
    if (typeof requestAnimationFrame !== 'function') return Timeline.after(scope, 0, callback, onCancel);
    var record = { scope: scope || 'default', kind: 'frame', id: null, onCancel: onCancel };
    record.id = requestAnimationFrame(function () { remove(record); callback(); });
    records.push(record);
    return record;
  };

  Timeline.delay = function (scope, ms) {
    return new Promise(function (resolve) {
      Timeline.after(scope, ms, function () { resolve({ cancelled: false }); }, function () { resolve({ cancelled: true }); });
    });
  };

  Timeline.cancelScope = function (scope) {
    var cancelled = records.filter(function (record) { return record.scope === scope; });
    cancelled.forEach(function (record) {
      if (record.kind === 'frame' && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(record.id);
      else clearTimeout(record.id);
      remove(record);
      if (record.onCancel) record.onCancel();
    });
    return cancelled.length;
  };

  Timeline.cancelAll = function () {
    var scopes = records.map(function (record) { return record.scope; });
    scopes.forEach(Timeline.cancelScope);
  };

  Timeline.pending = function (scope) {
    return records.filter(function (record) { return !scope || record.scope === scope; }).length;
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
