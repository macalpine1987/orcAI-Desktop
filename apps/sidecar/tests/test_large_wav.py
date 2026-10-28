import unittest

from orcai_desktop_sidecar.adapters.large_wav import (
    FULL_FILE_SPECTROGRAM_MAX_SEC,
    use_windowed_orcai_stft,
)


class LargeWavToggleTests(unittest.TestCase):
    def test_off_never_uses_windowed_stft(self) -> None:
        self.assertFalse(use_windowed_orcai_stft(3 * 3600, False))
        self.assertFalse(use_windowed_orcai_stft(30, False))

    def test_on_only_past_full_file_cap(self) -> None:
        self.assertFalse(use_windowed_orcai_stft(FULL_FILE_SPECTROGRAM_MAX_SEC, True))
        self.assertTrue(
            use_windowed_orcai_stft(FULL_FILE_SPECTROGRAM_MAX_SEC + 1, True),
        )


if __name__ == "__main__":
    unittest.main()
