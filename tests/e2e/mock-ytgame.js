// Mock of the YouTube Playables SDK served in place of https://www.youtube.com/game_api/v1 during e2e.
// Records every call so tests can assert ordering requirements.
(function () {
  const log = [];
  const listeners = { pause: [], resume: [], audio: [] };
  let audioEnabled = window.__ytMockAudio === false ? false : true;
  let store = window.__ytMockInitialSave ?? '';
  let loadResolved = false;
  const now = () => performance.now();
  const rec = (name, extra) => log.push(Object.assign({ name, t: now() }, extra || {}));
  window.__ytMock = {
    log,
    get save() {
      return store;
    },
    pause() {
      rec('pause');
      listeners.pause.forEach((cb) => cb());
    },
    resume() {
      rec('resume');
      listeners.resume.forEach((cb) => cb());
    },
    setAudio(on) {
      audioEnabled = on;
      listeners.audio.forEach((cb) => cb(on));
    },
    rewardResult: true,
  };
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'mock',
    game: {
      firstFrameReady() {
        rec('firstFrameReady');
      },
      gameReady() {
        rec('gameReady');
      },
      loadData() {
        rec('loadData:start');
        return new Promise((r) =>
          setTimeout(() => {
            loadResolved = true;
            rec('loadData:resolved');
            r(store);
          }, 150),
        );
      },
      saveData(data) {
        rec('saveData', { afterLoad: loadResolved, size: data.length });
        store = data;
        return Promise.resolve();
      },
    },
    system: {
      isAudioEnabled() {
        return audioEnabled;
      },
      onAudioEnabledChange(cb) {
        listeners.audio.push(cb);
        return () => undefined;
      },
      onPause(cb) {
        listeners.pause.push(cb);
        return () => undefined;
      },
      onResume(cb) {
        listeners.resume.push(cb);
        return () => undefined;
      },
      getLanguage() {
        return Promise.resolve('en-US');
      },
    },
    engagement: {
      sendScore(s) {
        rec('sendScore', { value: s.value });
        return Promise.resolve();
      },
    },
    ads: {
      requestInterstitialAd() {
        rec('interstitial');
        return Promise.resolve();
      },
      requestRewardedAd(id) {
        rec('rewarded', { id });
        return Promise.resolve(window.__ytMock.rewardResult);
      },
    },
    health: {
      logError() {
        rec('logError');
      },
      logWarning() {
        rec('logWarning');
      },
    },
  };
})();
