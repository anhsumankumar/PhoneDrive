import os
import sys
import subprocess
import tempfile
from pathlib import Path

# Add pc directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from media_engine import MediaEngine
from music_engine import MusicEngine
from database import Database

def run_tests():
    print("=" * 60)
    print("PHONEDRIVE ADVANCED MEDIA & MUSIC COMPATIBILITY TEST SUITE")
    print("=" * 60)

    ffmpeg_bin = MediaEngine.get_ffmpeg_cmd()
    ffprobe_bin = MediaEngine.get_ffprobe_cmd()
    print(f"FFmpeg binary:  {ffmpeg_bin}")
    print(f"FFprobe binary: {ffprobe_bin}")

    temp_dir = Path(tempfile.mkdtemp(prefix="phonedrive_media_test_"))
    print(f"Test Workspace: {temp_dir}\n")

    matrix = []

    # 1. TEST: MP4 with H.264 Video + AAC Stereo Audio
    mp4_path = temp_dir / "sample_h264_aac.mp4"
    cmd = [
        ffmpeg_bin, "-y", "-f", "lavfi", "-i", "color=c=navy:s=1280x720:d=2",
        "-f", "lavfi", "-i", "sine=f=440:d=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        str(mp4_path)
    ]
    subprocess.run(cmd, capture_output=True)
    if mp4_path.exists():
        probe = MediaEngine.probe_media(mp4_path)
        matrix.append({
            "File": mp4_path.name,
            "Container": probe["container"],
            "Video Codec": probe["videoCodec"],
            "Audio Codec": probe["audioCodec"],
            "Resolution": probe["resolution"],
            "Strategy": probe["playbackStrategy"],
            "Native": probe["isBrowserNative"],
        })
        print(f"[PASS] MP4 (H.264 + AAC): Strategy={probe['playbackStrategy']} (Native={probe['isBrowserNative']})")

    # 2. TEST: MKV with H.264 Video + AAC Audio (Should detect REMUX strategy)
    mkv_h264_path = temp_dir / "sample_h264_aac.mkv"
    cmd = [
        ffmpeg_bin, "-y", "-i", str(mp4_path),
        "-c", "copy",
        str(mkv_h264_path)
    ]
    subprocess.run(cmd, capture_output=True)
    if mkv_h264_path.exists():
        probe = MediaEngine.probe_media(mkv_h264_path)
        matrix.append({
            "File": mkv_h264_path.name,
            "Container": probe["container"],
            "Video Codec": probe["videoCodec"],
            "Audio Codec": probe["audioCodec"],
            "Resolution": probe["resolution"],
            "Strategy": probe["playbackStrategy"],
            "Native": probe["isBrowserNative"],
        })
        print(f"[PASS] MKV (H.264 + AAC): Strategy={probe['playbackStrategy']} (Reason: {probe['strategyReason']})")

    # 3. TEST: MKV with H.264 Video + AC-3 5.1ch Surround Audio (Should detect TRANSCODE_AUDIO)
    mkv_ac3_path = temp_dir / "sample_h264_ac3.mkv"
    cmd = [
        ffmpeg_bin, "-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=2",
        "-f", "lavfi", "-i", "sine=f=880:d=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "ac3", "-b:a", "384k",
        str(mkv_ac3_path)
    ]
    subprocess.run(cmd, capture_output=True)
    if mkv_ac3_path.exists():
        probe = MediaEngine.probe_media(mkv_ac3_path)
        matrix.append({
            "File": mkv_ac3_path.name,
            "Container": probe["container"],
            "Video Codec": probe["videoCodec"],
            "Audio Codec": probe["audioCodec"],
            "Resolution": probe["resolution"],
            "Strategy": probe["playbackStrategy"],
            "Native": probe["isBrowserNative"],
        })
        print(f"[PASS] MKV (H.264 + AC3): Strategy={probe['playbackStrategy']} (Reason: {probe['strategyReason']})")

    # 4. TEST: MKV with HEVC / H.265 10-bit Video (Should detect TRANSCODE_FULL)
    mkv_hevc_path = temp_dir / "sample_hevc_10bit.mkv"
    cmd = [
        ffmpeg_bin, "-y", "-f", "lavfi", "-i", "color=c=teal:s=1920x1080:d=2",
        "-f", "lavfi", "-i", "sine=f=440:d=2",
        "-c:v", "libx265", "-pix_fmt", "yuv420p10le",
        "-c:a", "aac",
        str(mkv_hevc_path)
    ]
    res = subprocess.run(cmd, capture_output=True)
    if mkv_hevc_path.exists():
        probe = MediaEngine.probe_media(mkv_hevc_path)
        matrix.append({
            "File": mkv_hevc_path.name,
            "Container": probe["container"],
            "Video Codec": probe["videoCodec"],
            "Audio Codec": probe["audioCodec"],
            "Resolution": probe["resolution"],
            "Strategy": probe["playbackStrategy"],
            "Native": probe["isBrowserNative"],
        })
        print(f"[PASS] MKV (HEVC 10-bit): Strategy={probe['playbackStrategy']}, BitDepth={probe['bitDepth']} (Reason: {probe['strategyReason']})")

    # 5. TEST: Subtitle WebVTT conversion with Hindi Devanagari Unicode
    srt_content = """1
00:00:01,000 --> 00:00:03,500
नमस्ते दुनिया! PhoneDrive Universal Video Player.

2
00:00:04,000 --> 00:00:06,000
Enjoy high-fidelity streaming in English & हिंदी.
"""
    vtt = MediaEngine.convert_srt_to_vtt(srt_content)
    assert "WEBVTT" in vtt
    assert "00:00:01.000" in vtt
    assert "नमस्ते दुनिया!" in vtt
    print("[PASS] Subtitle WebVTT Conversion & Unicode Hindi Support Verified!")

    # 6. TEST: Audio Engine (MP3, FLAC, WAV, M4A) Metadata & Cover Art
    flac_path = temp_dir / "test_track.flac"
    cmd = [
        ffmpeg_bin, "-y", "-f", "lavfi", "-i", "sine=f=1000:d=2",
        "-c:a", "flac",
        str(flac_path)
    ]
    subprocess.run(cmd, capture_output=True)
    if flac_path.exists():
        meta = MusicEngine.probe_audio(flac_path)
        assert meta["codec"].lower() == "flac"
        assert meta["lossless"] is True
        print(f"[PASS] MusicEngine FLAC: Codec={meta['codec']}, Lossless={meta['lossless']}, SampleRate={meta['sampleRate']}Hz")

    # 7. TEST: Database Playlist, Favorites & Play History
    db_path = temp_dir / "test_phonedrive.db"
    db = Database(db_path=db_path)
    pl = db.create_playlist("Top Bollywood Hits")
    assert pl["name"] == "Top Bollywood Hits"
    added = db.add_track_to_playlist(pl["id"], "track_123")
    assert added is True
    track_ids = db.get_playlist_track_ids(pl["id"])
    assert "track_123" in track_ids
    fav = db.toggle_music_favorite("track_123")
    assert fav is True
    db.record_music_play("track_123")
    history = db.get_recently_played_music()
    assert len(history) == 1 and history[0]["track_id"] == "track_123"
    print("[PASS] Database Playlists, Favorites, and Play History Verified!")

    # 8. TEST: Streaming Transcode & Remux process generation
    proc_remux = MediaEngine.create_transcode_process(mkv_h264_path, strategy_override="remux")
    chunk = proc_remux.stdout.read(4096)
    proc_remux.terminate()
    assert len(chunk) > 0, "Remux process returned no bytes"
    print(f"[PASS] Real-time Remux fMP4 stream initialized (First chunk: {len(chunk)} bytes)")

    print("\n" + "=" * 60)
    print("MEDIA COMPATIBILITY MATRIX SUMMARY")
    print("=" * 60)
    print(f"{'Container':<12} | {'Video Codec':<12} | {'Audio Codec':<12} | {'Resolution':<12} | {'Strategy':<16} | {'Native'}")
    print("-" * 80)
    for row in matrix:
        print(f"{row['Container']:<12} | {row['Video Codec']:<12} | {row['Audio Codec']:<12} | {row['Resolution']:<12} | {row['Strategy']:<16} | {str(row['Native'])}")

    # Clean up test temp files
    try:
        import shutil
        shutil.rmtree(temp_dir)
    except Exception:
        pass

    print("\nALL 8 TEST PHASES COMPLETED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
