# Mac App Store Metadata

Use these values for the first Mac App Store release in App Store Connect.

## Product Page

App name:

```text
SilkScribe
```

Subtitle:

```text
Private voice typing for Mac
```

Promotional text:

```text
Private voice typing for Mac. Hold a shortcut, speak naturally, and SilkScribe writes clean text into the app you are already using.
```

Description:

```text
SilkScribe is private voice typing for Mac. Hold a shortcut, speak naturally, and your words appear as clean text inside the app you are already using.

Use it for emails, notes, Slack replies, technical prompts, planning docs, support responses, and any text field where typing slows you down.

Key features:
- Local-first speech-to-text with on-device transcription models
- Global shortcut recording from anywhere on your Mac
- Automatic text insertion into the active app
- Guided setup for microphone and Accessibility permissions
- Model setup and management inside the app
- Recent dictation history for recovering useful text
- Configurable shortcuts, microphone, paste behavior, and audio feedback
- Optional post-processing for users who choose to connect a supported provider
- Open source codebase for people who want to inspect how it works

SilkScribe is designed to stay out of the way. It is not a meeting bot, a cloud workspace, or another place to move your writing. It gives your Mac a voice layer so you can capture rough thoughts and keep working where your cursor already is.

Privacy is central to the product. Core transcription is designed around local models on your Mac. Optional post-processing may send transcript text to the provider you configure, and only when you enable that workflow.
```

Keywords:

```text
dictation,speech to text,voice typing,transcription,macOS,offline,productivity,notes,writing
```

Support URL:

```text
https://saransh-sharma.github.io/SilkScribe/support/
```

Marketing URL:

```text
https://saransh-sharma.github.io/SilkScribe/
```

Privacy Policy URL:

```text
https://saransh-sharma.github.io/SilkScribe/privacy/
```

Version:

```text
1.0.0
```

Copyright:

```text
2026 Saransh Sharma
```

Category:

```text
Productivity
```

Price:

```text
Free
```

## Screenshots

Upload 5-7 screenshots from the submitted Mac App Store build. Export each as
RGB PNG or JPG at an accepted Mac size, preferably `2880 x 1800`.

Recommended order:

1. First launch/onboarding
2. Permission setup
3. Active dictation or recording overlay
4. Model selection/download
5. Settings for shortcuts and paste behavior
6. History or recent dictations

## Review Notes

```text
SilkScribe is a desktop speech-to-text utility. Audio is recorded from the microphone and transcribed locally by default. The app asks for Accessibility/Input Monitoring permissions so the user can trigger transcription with a global shortcut and insert the resulting text into the active text field. Model files are downloaded as data files used for local transcription. The App Store build does not include an in-app updater or in-app purchases.

If AI post-processing is enabled by the user, transcript text may be sent to the provider selected by the user for text cleanup. This is optional and controlled by the user in settings.
```

## Compliance Checklist

- Encryption export compliance: `ITSAppUsesNonExemptEncryption=false` because
  the app uses standard HTTPS/TLS and does not implement custom encryption.
- App Privacy: declare no developer-collected data if no SilkScribe server
  receives user data. Disclose optional external provider behavior in the
  privacy policy and review notes.
- Age rating: answer based on no user-generated public content, no web
  browsing, no in-app purchases, and no objectionable content.
- DSA trader status: complete in App Store Connect before EU distribution.
- In-app purchases: not applicable for the free, full-featured App Store build.
