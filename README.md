# Purpose

## Coming soon...

## Why `data-oil-target` and not `data-[identifier]-target=""`

Because It's verbose and I don't like it?

It also means we have a static attribute to listen for so we don't need to listen to
every attribute change making the attribute filter more performant.

## Why no `data-action`

I have personally never liked `data-action`. I find that the markup easily gets lost when refactoring,
and it also presents a CSP issue when unsafe functions are bound to controller.

Further Reading: <https://github.com/hotwired/stimulus/blob/main/SECURITY.md>

## Why no `data-[identifier]-outlet`, `data-[value-name]-value`, `data-[identifier]-class`

I don't find myself reaching for these things.
