<p align="center">
  <img src="https://raw.githubusercontent.com/xBeastxx/NauticPlayer/main/resources/NauticPlayerIcon.ico" alt="NauticPlayer Logo" width="120" height="120">
</p>

<h1 align="center">NauticPlayer</h1>

<p align="center">
  <strong>A Premium, Modern Media Player for Windows</strong>
</p>

<p align="center">
  <a href="https://github.com/xBeastxx/NauticPlayer/releases/latest">
    <img src="https://img.shields.io/github/v/release/xBeastxx/NauticPlayer?style=for-the-badge&logo=github&color=blue" alt="Latest Release">
  </a>
  <a href="https://github.com/xBeastxx/NauticPlayer/releases">
    <img src="https://img.shields.io/github/downloads/xBeastxx/NauticPlayer/total?style=for-the-badge&logo=github&color=green" alt="Total Downloads">
  </a>
  <a href="https://github.com/xBeastxx/NauticPlayer/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Proprietary-orange?style=for-the-badge" alt="License">
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#-installation">Installation</a> •
  <a href="#%EF%B8%8F-keyboard-shortcuts">Shortcuts</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-development">Development</a>
</p>

---

## 📖 About

**NauticPlayer** is a sleek, high-performance media player designed for Windows users who demand both aesthetics and power. Built with modern web technologies and powered by the legendary **MPV** media engine, NauticPlayer delivers a fluid, borderless viewing experience with crystal-clear video playback.

Whether you're watching local files or streaming content from the web, NauticPlayer provides a seamless, distraction-free experience with its elegant glassmorphism UI design.

---

## ✨ Features

### 🎨 **Crystal Glass UI**
- Borderless, transparent window with stunning glassmorphism effects
- Smooth animations and transitions throughout the interface
- Minimalist design that puts your content first

### � **Powerful Playback Engine**
- Powered by **MPV** - the most versatile media player engine
- Hardware-accelerated video decoding for smooth 4K/HDR playback
- Support for virtually all video and audio formats (MKV, MP4, AVI, MOV, WebM, and more)

### 🌐 **Stream Anything**
- Built-in **yt-dlp** integration for streaming online content
- Paste a URL and play - it's that simple
- Automatic updates for yt-dlp to ensure compatibility

### 📝 **Subtitle Support**
- Quick access to **OpenSubtitles** and **Subdivx** for subtitle downloads
- Multiple subtitle track selection
- Full subtitle customization options

### 🎛️ **Advanced Controls**
- Interactive volume and timeline sliders with smooth drag support
- Loop modes (None, File, A-B Loop)
- Playback speed control
- Audio and video track selection

### 🎨 **Video Enhancement Shaders**
- Built-in collection of 39+ video enhancement shaders
- Real-time shader toggling for improved video quality
- Anime4K, FSRCNNX, and more upscaling options

### ⚙️ **Smart Settings**
- Customizable video, audio, and subtitle preferences
- Screenshot capture with configurable format and template
- Hardware acceleration options
- Cache and performance tuning

### �️ **Modern Window Management**
- Frameless design with custom window controls
- True fullscreen mode with taskbar hiding
- Remembers window size and position
- Single-instance application with file forwarding

### 🔄 **Auto Updates**
- Automatic application updates via GitHub Releases
- Silent background updates with user notification
- Always stay up-to-date with the latest features

---

## 📸 Screenshots

> *Coming soon - Add your screenshots here!*

---

## 📥 Installation

### Download Pre-built Installer

1. Go to the [**Releases Page**](https://github.com/xBeastxx/NauticPlayer/releases/latest)
2. Download the latest `NauticPlayer-Setup-x.x.x.exe`
3. Run the installer and follow the prompts
4. Enjoy! 🎉

### Supported Platforms

| Platform | Status |
|----------|--------|
| Windows 10/11 (x64) | ✅ Fully Supported |
| macOS | ❌ Not Available |
| Linux | ❌ Not Available |

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Play / Pause | `Space` |
| Toggle Fullscreen | `F` or `Double-Click` |
| Increase Volume | `↑` |
| Decrease Volume | `↓` |
| Seek Forward (5s) | `→` |
| Seek Backward (5s) | `←` |
| Seek Forward (60s) | `Shift + →` |
| Seek Backward (60s) | `Shift + ←` |
| Mute / Unmute | `M` |
| Take Screenshot | `S` |
| Toggle Loop | `L` |
| Next Audio Track | `A` |
| Next Subtitle Track | `V` |
| Show/Hide Controls | `Mouse Movement` |

---

## 🛠️ Tech Stack

NauticPlayer is built with cutting-edge technologies:

| Technology | Purpose |
|------------|---------|
| **Electron 28** | Cross-platform desktop framework |
| **React 18** | Modern UI framework |
| **TypeScript** | Type-safe JavaScript |
| **Vite (electron-vite)** | Lightning-fast build tool |
| **MPV** | High-performance media engine |
| **yt-dlp** | Online streaming support |
| **FFmpeg** | Media encoding/decoding |
| **Lucide React** | Beautiful icon library |

---

## 💻 Development

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/xBeastxx/NauticPlayer.git
cd NauticPlayer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server with hot-reload |
| `npm run build` | Build the application for production |
| `npm run preview` | Preview the production build |
| `npm run package` | Create a distributable installer |
| `npm run typecheck` | Run TypeScript type checking |

### Project Structure

```
NauticPlayer/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # Main entry point
│   │   ├── mpvController.ts   # MPV integration
│   │   └── subtitleController.ts
│   ├── preload/        # Preload scripts
│   └── renderer/       # React UI
│       └── src/
│           ├── App.tsx
│           └── components/
│               ├── Controls.tsx
│               ├── Player.tsx
│               ├── SettingsMenu.tsx
│               └── LegalModal.tsx
├── resources/
│   ├── bin/           # yt-dlp binary
│   ├── mpv/           # MPV player binaries
│   ├── shaders/       # Video enhancement shaders
│   ├── legal/         # EULA and legal documents
│   └── icon.png       # Application icon
└── electron-builder.yml
```

---

## 📜 Legal & Licensing

### Proprietary License

NauticPlayer is provided **free of charge** for personal and commercial use. However, the UI design, branding, and proprietary logic remain the intellectual property of **NauticGames™**.

**You may:**
- ✅ Use the software freely
- ✅ Share it with others
- ✅ Use it for commercial purposes

**You may not:**
- ❌ Sell or resell the software
- ❌ Claim the proprietary components as your own
- ❌ Remove or modify branding/attribution

### Open Source Components

NauticPlayer includes the following open-source components, each governed by their respective licenses:

| Component | License | Website |
|-----------|---------|---------|
| **MPV** | GPL v2 / LGPL | [mpv.io](https://mpv.io) |
| **FFmpeg** | LGPL / GPL | [ffmpeg.org](https://ffmpeg.org) |
| **yt-dlp** | The Unlicense | [github.com/yt-dlp](https://github.com/yt-dlp/yt-dlp) |

You are free to modify or replace these components in accordance with their licenses.

---

## 🙏 Acknowledgments

Special thanks to the incredible open-source projects that make NauticPlayer possible:

- [MPV](https://mpv.io) - The best media player engine
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Amazing streaming capabilities
- [FFmpeg](https://ffmpeg.org) - The multimedia Swiss Army knife
- [Electron](https://www.electronjs.org/) - Building cross-platform apps
- [React](https://react.dev/) - Modern UI development

---

## 📞 Support & Contact

- **Issues & Bug Reports:** [GitHub Issues](https://github.com/xBeastxx/NauticPlayer/issues)
- **Author:** Manuel Perez Rodriguez
- **Organization:** NauticGames™

---

<p align="center">
  <strong>Made with ❤️ by NauticGames™</strong>
</p>

<p align="center">
  <sub>© 2024-2026 Manuel Perez Rodriguez. All rights reserved.</sub>
</p>
