# ADR 0001 — The icons of an installed app are supplied by the operator, not generated from their logo

|            |                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------- |
| **Status** | Accepted                                                                                    |
| **Date**   | October 2026                                                                                |
| **Scope**  | `apps/core`: the instance's pictures (spec §3.12, §3.15), the web app manifest (§1.3)       |
| **Origin** | [RFC 0001](../rfcs/0001-installable-core.md), the fourth task of [epic 11](../epics/pwa.md) |

## Context

An installed core takes its icon from the web app manifest. Until an operator sets one, that is the Sovereign mark.
An instance with its own branding wants its own icon there.

A manifest's icons must be PNGs of particular sizes (192 and 512 pixels), and a phone that cuts icons to a shape (a
circle, a rounded square) wants a **maskable** one, drawn with the picture kept to the middle 80% and the background
filled to the edges. An operator's uploaded logo is an SVG, or a PNG, JPEG or WebP of any proportions, often a wide
wordmark. Turning that into the right icons means rasterising, resizing, cropping or padding it, and choosing a
background for the mask.

## Decision

The operator **supplies** the icon: a fourth and fifth instance picture, **App icon** and an optional **App icon for
masking**, set in the Console beside the logos and favicon. Each must be a **square PNG, between 512 and 1024 pixels
on a side**, judged by its bytes like every picture and kept as it is. The manifest names the app icon for both the
192 and the 512 pixel sizes (the device scales it down), names the maskable one only if there is one, and falls back to
the Sovereign icons for an instance that has set none. The same icon is the iPhone's home-screen icon.

Core does not resize, crop, pad or convert anything.

## Alternatives considered

| Alternative                                                            | Why not                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Generate the icons from the logo with an image library** (`sharp`)   | A native dependency, built per platform, in an image that is otherwise code and a Node runtime: a change to the Dockerfile and the image's size, a new thing to keep patched, and a decoder for untrusted uploads in the server. It would also have to guess a crop and a mask background for a wordmark, and guess wrong |
| **Resize in pure JavaScript**                                          | A hand-written PNG decoder and encoder for untrusted input, to produce an icon an operator has no say in. The security surface of the first, with none of its maturity                                                                                                                                                    |
| **Resize in the operator's browser (a canvas) and upload the results** | Works, and needs no server code, but it is a Console feature with its own preview, crop and padding controls: a large piece of interface for something an operator can do once in any image editor                                                                                                                        |
| **Use the favicon or the logo as the icon as they are**                | A favicon is often 32 pixels and an SVG, a logo a wide wordmark. A device refuses or distorts them, and the install prompt may not be offered at all                                                                                                                                                                      |
| **Leave the Sovereign mark in every instance's manifest**              | The RFC's accepted default, and what an instance gets until it sets an icon. An operator who has branded everything else would see a different mark on their home screen                                                                                                                                                  |

## Consequences

- **No new dependency and nothing added to the image.** The pictures table already holds any picture by kind, so there
  is no schema change on any database; the Console and the validation gain two kinds.
- **The operator does the one step core will not:** export a square PNG at 512 pixels or more (and, if they want a
  masked icon, one with a safe margin). The Console says exactly this beside the upload, and an icon that is not that
  is refused with the same words.
- **A device that wants exactly 192 pixels scales a larger picture down itself**, which every browser does well.
- **A maskable icon is the operator's own art**, never a mask applied by core. Without one the app icon is not
  masked, and the Sovereign maskable icon is never mixed with an operator's own.
- **If operators turn out to find this too much to ask**, generating the icons is a later, additive change: a server
  that can resize would fill the same two pictures when only a logo is set. Nothing here prevents it.
