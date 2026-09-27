---
title: "Inside the mindmap editor: how the mapping tools actually work"
description: "A practical tour of the tldraw-based mindmap editor in Quran Life and the specific tools and safeguards it gives you while mapping."
date: 2026-03-31
last_update:
  date: 2026-04-02
authors: quran-life
tags: [feature-deep-dive, philosophy]
slug: inside-the-mindmap-editor
---

# Inside the mindmap editor: how the mapping tools actually work

Quran Life's mindmap editor is built on top of tldraw, so it behaves like a real canvas rather than a text field pretending to be visual.

The editor starts from a lasso-style selection workflow, which fits mindmapping better than forcing you into ordinary box-selection first. Freehand drawing is still the preferred method because it usually gives the most natural map, but the editor also accounts for people who do not think or draw well that way. That is why it gives you arrows, text, and normal selection tools too.

So the important thing to understand about the editor is not only that it exists. It is that Quran Life treats it as an actual working environment for mapping, not as a decorative attachment on the side.

