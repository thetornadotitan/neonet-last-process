/**
 * @file src/audio.js
 * @description Manages all game audio, ensuring a continuous, shuffled background music playlist.
 */

const MUSIC_TRACKS = [
  "res/audio/music/Neon Byte Raid.mp3",
  "res/audio/music/Pixel Drift Loop.mp3",
  "res/audio/music/Pixel Rain Relay.mp3",
];

/**
 * @class AudioManager
 * @description Handles background music playback, playlist shuffling, and volume control.
 */
export class AudioManager {
  /**
   * @param {Store} store - The application's Store instance to read/save audio settings.
   */
  constructor(store) {
    this.store = store;

    // Core audio element
    this.audio = new Audio();
    this.audio.loop = false; // We handle looping across the playlist manually

    // Playlist state
    this.tracks = [...MUSIC_TRACKS];
    this.shuffle();
    this.currentTrackIndex = -1;

    // Bind track completion to play the next track
    this.audio.addEventListener("ended", () => this.playNextTrack());

    // Initial setup based on persisted settings
    this.syncFromStore();

    // Start the first track
    this.playNextTrack();
  }

  /**
   * @description Syncs the volume and muted state from the Store instance.
   */
  syncFromStore() {
    const settings = this.store.meta.settings;
    this.setVolume(settings.musicVolume ?? 0.5);
    this.setMuted(settings.musicMuted ?? false);
  }

  /**
   * @description Shuffles the internal track list using the Fisher-Yates algorithm.
   */
  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  /**
   * @description Advances to the next track in the shuffled list and plays it.
   */
  playNextTrack() {
    this.currentTrackIndex++;

    // If we've reached the end, reshuffle and wrap around
    if (this.currentTrackIndex >= this.tracks.length) {
      this.shuffle();
      this.currentTrackIndex = 0;
    }

    const track = this.tracks[this.currentTrackIndex];
    this.audio.src = track;
    this.audio.play().catch((error) => {
      console.warn(
        "Audio playback failed (likely due to user interaction policy):",
        error,
      );
    });
  }

  /**
   * @param {number} value - A value between 0.0 and 1.0.
   */
  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  /**
   * @param {boolean} value - True to mute, false to unmute.
   */
  setMuted(value) {
    this.audio.muted = value;
  }

  /**
   * @description Cleans up the audio manager (useful if the game module is ever reloaded/hot-swapped).
   */
  destroy() {
    this.audio.pause();
    this.audio.src = "";
    // Remove the event listener to prevent memory leaks
    this.audio.removeEventListener("ended", this.playNextTrack);
  }
}
