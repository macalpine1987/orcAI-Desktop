# orcAI Desktop

orcAI Desktop is a working prototype of a desktop application for [orcAI](https://github.com/ethz-tb/orcAI), a tool for training, testing & applying AI models to detect acoustic signals in spectrograms generated from audio recordings. This release uses orcAI 3.0.4.

The public release is **1.0.0** for macOS arm64: [orcAI Desktop 1.0.1](https://github.com/macalpine1987/orcAI-Desktop/releases/tag/v1.0.0). The disk image includes Python, TensorFlow, and the orcAI models. A system Python install is not required. Linux support is in progress.

The interface is the Lab layout. Russian and English are chosen at startup; English is selected by default. The choice is saved.

## Run from source

```bash
bash scripts/generate-icons.sh
npm install && npm install --prefix apps/ui
npm run prepare:sidecar
npm run dev
```

`npm run dev` starts the native window. The sidecar uses the bundled Python from the local cache.

The recognition screen opens a system dialog for a `.wav` file or `recording_table.csv`.

The interface without the native window:

```bash
cd apps/ui && npm install && npm run dev
```

Open http://localhost:1420. Recognition and training need the sidecar.

## macOS release build

```bash
npm run build:macos
```

This produces the autonomous `.app`. `npm run build` only runs `tauri build` and does not embed Python.

## Tests

```bash
npm run ui:test
npm run sidecar:test
```

## Layout

```
orcai-desktop/
├── src-tauri/       # Tauri 2 shell
├── apps/ui/         # React interface
├── apps/sidecar/    # FastAPI sidecar, orcAI 3.0.4
├── scripts/
└── docs/manual/     # Help chapters bundled into the app
```

Sidecar routes are listed in [apps/sidecar/README.md](apps/sidecar/README.md). In development the sidecar takes a free localhost port; `VITE_SIDECAR_URL` can point at `http://127.0.0.1:8741`.

## License

[CC BY-SA 4.0](LICENSE). orcAI is developed at ETH Zurich and is also CC BY-SA 4.0.
