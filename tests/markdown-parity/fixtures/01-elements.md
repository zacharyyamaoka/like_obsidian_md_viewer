---
title: Element coverage
tags: [acceptance, markdown]
status: draft
---

# Heading one

## Heading two

### Heading three

#### Heading four

Body copy sets the baseline. Some **bold text**, some *italic text*, some
***bold italic***, some ~~struck through~~, some ==highlighted==, and some
`inline code` in a sentence long enough to wrap onto a second line so line
height and measure are both visible.

## Lists

- First bullet
- Second bullet
	- Nested bullet
	- Another nested one
		- Third level
- Back to top level

1. First ordered
2. Second ordered
	1. Nested ordered
	2. Second nested
3. Third ordered

- [x] A completed task
- [ ] An open task
- [ ] A task with **bold** and `code` inside it

## Quotes and callouts

> A plain blockquote, which should show a left rail and nothing else.
> It runs to a second line.

> [!note]
> A note callout with its own icon and title row.

> [!warning] Custom title here
> A warning callout, with an explicit title.

> [!tip]
> A tip callout.

## Table

| Column A | Column B | Numeric |
| -------- | -------- | ------: |
| one      | two      |      42 |
| three    | four     |    1024 |
| a longer cell value | short | 7 |

## Code

```python
def resolve(path: str) -> str:
    return path.lower()
```

```
plain fence, no language
```

## Links and references

An [external link](https://example.com), a [[wikilink]], a
[[wikilink|with an alias]], and a #tag inline.

![[embedded-note]]

## Rules and math

---

Inline math $E = mc^2$ and a display block:

$$
a^2 + b^2 = c^2
$$

A footnote reference[^1].

[^1]: The footnote body text.
