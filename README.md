# Ziven Pay To See

A Flarum 2.x extension that lets authors mark part of a post as paid content.
Payments use the point balance provided by `ramon/point-system`.

## Requirements

- Flarum `^2.0.0`
- `ramon/point-system` from `https://github.com/lowseekai/point-system`

## Installation

Install the extension from the repository in the forum's Composer project:

```sh
composer config repositories.lowseek-point-system vcs https://github.com/lowseekai/point-system.git
composer require ramon/point-system:dev-main
composer require ziiven/flarum-pay-to-see:dev-main
php flarum migrate
php flarum cache:clear
```

The extension uses the `[pay][/pay]` tag. Administrators can configure which
tags allow paid content and which groups may create, purchase, bypass, or
manage paid content.

## Updating

```sh
composer update ziiven/flarum-pay-to-see ramon/point-system
php flarum migrate
php flarum cache:clear
```
