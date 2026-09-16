<?php

declare(strict_types=1);

namespace Ziven\pay2see\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Foundation\ErrorHandling\LogReporter;
use Flarum\Locale\TranslatorInterface;
use Flarum\Post\CommentPost;
use Flarum\Post\Post;
use Ziven\pay2see\ProcessContent;

final class PostFields
{
    public function __construct(
        private TranslatorInterface $translator,
        private LogReporter $log,
    ) {
    }

    public function __invoke(Schema\Str $field): Schema\Str
    {
        return $field->get(function (Post $post, Context $context): ?string {
            if (! $post instanceof CommentPost) {
                return null;
            }

            try {
                $html = $post->formatContent($context->request);
                $post->setAttribute('renderFailed', false);
            } catch (\Throwable $e) {
                $html = $this->translator->trans('core.lib.error.render_failed_message');
                $post->setAttribute('renderFailed', true);
                $this->log->report($e);
            }

            return ProcessContent::transform(
                $html,
                $post,
                $context->getActor(),
                $this->translator,
            );
        });
    }
}
