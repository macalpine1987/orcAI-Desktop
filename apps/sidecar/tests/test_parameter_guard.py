"""Jobs stop before orcAI when a parameter would crash the engine."""

from __future__ import annotations

import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.parameter_guard import (
    load_parameter_document,
    reject_predict_channels,
    reject_snippet_parameter,
    reject_spectrogram_parameter,
    reject_train_parameter,
)


def _spectro(**overrides: object) -> dict:
    spec = {
        "sampling_rate": 48_000,
        "nfft": 512,
        "n_overlap": 256,
        "freq_range": [0, 16_000],
        "quantiles": [0.01, 0.999],
    }
    spec.update(overrides)
    return {"spectrogram": spec}


def _snippets(**overrides: object) -> dict:
    snippets = {
        "fraction_removal": 0.99,
        "segment_duration": 200,
        "snippet_duration": 4,
        "train": 0.8,
        "val": 0.1,
        "test": 0.1,
    }
    snippets.update(overrides)
    return {"snippets": snippets}


def _wav(path: Path, channels: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(16_000)
        handle.writeframes(b"\x00\x00" * 16 * channels)


class SpectrogramGuardTests(unittest.TestCase):
    def test_factory_values_pass(self) -> None:
        reject_spectrogram_parameter(_spectro())

    def test_hop_may_be_larger_than_nfft(self) -> None:
        reject_spectrogram_parameter(_spectro(n_overlap=1024, nfft=512))

    def test_upper_frequency_may_equal_nyquist(self) -> None:
        reject_spectrogram_parameter(
            _spectro(sampling_rate=22_050, freq_range=[0, 11_025])
        )

    def test_zero_nfft_hop_and_frequency_above_nyquist_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "nfft"):
            reject_spectrogram_parameter(_spectro(nfft=0))
        with self.assertRaisesRegex(ValueError, "n_overlap"):
            reject_spectrogram_parameter(_spectro(n_overlap=0))
        with self.assertRaisesRegex(ValueError, "n_overlap"):
            reject_spectrogram_parameter(_spectro(n_overlap=-8))
        with self.assertRaisesRegex(ValueError, "Nyquist"):
            reject_spectrogram_parameter(
                _spectro(sampling_rate=22_050, freq_range=[0, 16_000])
            )

    def test_quantiles_outside_unit_interval_or_reversed_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "quantiles"):
            reject_spectrogram_parameter(_spectro(quantiles=[-0.1, 0.9]))
        with self.assertRaisesRegex(ValueError, "quantiles"):
            reject_spectrogram_parameter(_spectro(quantiles=[0.1, 1.2]))
        with self.assertRaisesRegex(ValueError, "quantiles"):
            reject_spectrogram_parameter(_spectro(quantiles=[0.8, 0.2]))
        with self.assertRaisesRegex(ValueError, "quantiles"):
            reject_spectrogram_parameter(_spectro(quantiles=[0.5, 0.5]))

    def test_missing_file_is_left_for_orcai(self) -> None:
        self.assertIsNone(load_parameter_document("/tmp/orcai-no-such-parameter.json"))

    def test_broken_json_fails_the_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "orcai_parameter.json"
            path.write_text("{", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not valid JSON"):
                load_parameter_document(path)


class SnippetGuardTests(unittest.TestCase):
    def test_factory_removal_and_a_short_snippet_pass(self) -> None:
        reject_snippet_parameter(_snippets())
        reject_snippet_parameter(_snippets(fraction_removal=0))
        reject_snippet_parameter(_snippets(fraction_removal=1))

    def test_removal_outside_zero_to_one_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "fraction_removal"):
            reject_snippet_parameter(_snippets(fraction_removal=1.01))
        with self.assertRaisesRegex(ValueError, "fraction_removal"):
            reject_snippet_parameter(_snippets(fraction_removal=-0.01))

    def test_snippet_must_be_shorter_than_the_smallest_split_window(self) -> None:
        narrow = _snippets(train=0.8, val=0.15, test=0.05, snippet_duration=10)
        with self.assertRaisesRegex(ValueError, "test window"):
            reject_snippet_parameter(narrow)
        reject_snippet_parameter({**narrow, "snippets": {**narrow["snippets"], "snippet_duration": 9.9}})


class TrainGuardTests(unittest.TestCase):
    def test_zero_epochs_and_batch_size_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "epochs"):
            reject_train_parameter({"model": {"epochs": 0, "batch_size": 64}})
        with self.assertRaisesRegex(ValueError, "batch_size"):
            reject_train_parameter({"model": {"epochs": 30, "batch_size": 0}})
        with self.assertRaisesRegex(ValueError, "batch_size"):
            reject_train_parameter({"model": {"epochs": 30, "batch_size": -8}})

    def test_positive_epochs_and_batch_size_pass(self) -> None:
        reject_train_parameter({"model": {"epochs": 30, "batch_size": 64}})


class PredictChannelGuardTests(unittest.TestCase):
    def test_channel_must_exist_on_the_wav(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mono = root / "mono.wav"
            stereo = root / "stereo.wav"
            _wav(mono, 1)
            _wav(stereo, 2)
            reject_predict_channels(mono, channel=1)
            reject_predict_channels(stereo, channel=2)
            with self.assertRaisesRegex(ValueError, "Channel 2"):
                reject_predict_channels(mono, channel=2)
            with self.assertRaisesRegex(ValueError, "Channel 0"):
                reject_predict_channels(stereo, channel=0)

    def test_csv_row_uses_its_own_channel(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            recordings = root / "recordings"
            _wav(recordings / "a.wav", 1)
            _wav(recordings / "b.wav", 1)
            table = root / "recording_table.csv"
            table.write_text(
                "recording,channel,base_dir_recording,rel_recording_path\n"
                f"a,1,{recordings},a.wav\n"
                f"b,2,{recordings},b.wav\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Channel 2 is not in b"):
                reject_predict_channels(table, channel=1)

    def test_missing_wav_is_left_for_orcai(self) -> None:
        reject_predict_channels("/tmp/orcai-no-such-recording.wav", channel=9)


class GuardStopsTheEngineTests(unittest.TestCase):
    def test_create_spectrograms_stops_before_orcai(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_create_spectrograms

        called: list[str] = []

        def spy(
            recording_table_path,
            output_dir,
            base_dir_recording=None,
            orcai_parameter=None,
            include_not_annotated=False,
            include_no_possible_annotations=False,
            overwrite=False,
            verbosity=2,
            msgr=None,
        ) -> None:
            del (
                recording_table_path,
                output_dir,
                base_dir_recording,
                orcai_parameter,
                include_not_annotated,
                include_no_possible_annotations,
                overwrite,
                verbosity,
                msgr,
            )
            called.append("spectrograms")

        from _librosa_runtime import require_librosa

        require_librosa(self)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "orcai_parameter.json"
            path.write_text(json.dumps(_spectro(nfft=0)), encoding="utf-8")
            with (
                patch("orcai.spectrogram.create_spectrograms", spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._messenger",
                    return_value=object(),
                ),
                self.assertRaisesRegex(ValueError, "nfft"),
            ):
                run_create_spectrograms(
                    "job-spec",
                    {
                        "recording_table_path": str(Path(tmp) / "recording_table.csv"),
                        "output_dir": str(Path(tmp) / "out"),
                        "orcai_parameter": str(path),
                    },
                )
        self.assertEqual(called, [])

    def test_create_snippet_table_stops_before_orcai(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_create_snippet_table

        called: list[str] = []

        def spy(
            recording_table_path,
            recording_data_dir,
            output_dir=None,
            orcai_parameter=None,
            verbosity=2,
            msgr=None,
        ) -> None:
            del recording_table_path, recording_data_dir, output_dir, orcai_parameter, verbosity, msgr
            called.append("snippets")

        with (
            patch("orcai.snippets.create_snippet_table", spy),
            patch(
                "orcai_desktop_sidecar.adapters.training_dataset._messenger",
                return_value=object(),
            ),
            self.assertRaisesRegex(ValueError, "fraction_removal"),
        ):
            run_create_snippet_table(
                "job-snip",
                {
                    "recording_table_path": "/tmp/recording_table.csv",
                    "recording_data_dir": "/tmp/recording_data",
                    "orcai_parameter": _snippets(fraction_removal=2),
                },
            )
        self.assertEqual(called, [])

    def test_train_stops_before_orcai(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_train

        called: list[str] = []

        def spy(
            data_dir,
            output_dir,
            orcai_parameter=None,
            compression_type="GZIP",
            load_model=False,
            load_model_from=None,
            verbosity=2,
            msgr=None,
        ) -> None:
            del (
                data_dir,
                output_dir,
                orcai_parameter,
                compression_type,
                load_model,
                load_model_from,
                verbosity,
                msgr,
            )
            called.append("train")

        with (
            patch("orcai.train.train", spy),
            patch(
                "orcai_desktop_sidecar.adapters.training_fit._messenger",
                return_value=object(),
            ),
            self.assertRaisesRegex(ValueError, "epochs"),
        ):
            run_train(
                "job-train",
                {
                    "data_dir": "/tmp/tvt_data",
                    "output_dir": "/tmp/models",
                    "orcai_parameter": {"model": {"epochs": 0, "batch_size": 64}},
                },
            )
        self.assertEqual(called, [])

    def test_predict_stops_before_orcai(self) -> None:
        from orcai_desktop_sidecar.adapters.predict import run_predict

        called: list[str] = []

        def spy(
            recording_path,
            channel=1,
            threshold=0.5,
            model_dir=None,
            output_path="default",
            overwrite=False,
            save_probabilities=False,
            base_dir_recording=None,
            call_duration_limits=None,
            label_suffix="*",
            verbosity=2,
            msgr=None,
        ) -> None:
            del (
                recording_path,
                channel,
                threshold,
                model_dir,
                output_path,
                overwrite,
                save_probabilities,
                base_dir_recording,
                call_duration_limits,
                label_suffix,
                verbosity,
                msgr,
            )
            called.append("predict")

        from _librosa_runtime import require_librosa

        require_librosa(self)
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "mono.wav"
            _wav(wav, 1)
            with (
                patch("orcai.predict.predict", spy),
                patch(
                    "orcai_desktop_sidecar.adapters.predict._messenger",
                    return_value=_Msgr(),
                ),
                self.assertRaisesRegex(ValueError, "Channel 2"),
            ):
                run_predict(
                    "job-predict",
                    {"recording_path": str(wav), "channel": 2},
                )
        self.assertEqual(called, [])


class _Msgr:
    def info(self, *_args: object, **_kwargs: object) -> None:
        return None

    def warning(self, *_args: object, **_kwargs: object) -> None:
        return None

    def print(self, *_args: object, **_kwargs: object) -> None:
        return None

    def success(self, *_args: object, **_kwargs: object) -> None:
        return None
