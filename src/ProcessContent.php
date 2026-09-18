<?php

declare(strict_types=1);

namespace Ziven\pay2see;

use Flarum\Locale\TranslatorInterface;
use Flarum\Post\Post;
use Flarum\User\Guest;
use Flarum\User\User;
use Ziven\pay2see\Model\PaidDiscussion;

final class ProcessContent
{
    public static function transform(
        string $html,
        Post $post,
        User|Guest $actor,
        TranslatorInterface $translator,
    ): string {
        $discussion = $post->discussion;
        $cost = $discussion?->pay2see_cost;

        if (! $discussion || (int) $post->user_id !== (int) $discussion->user_id || $cost === null) {
            return $html;
        }

        $currentUserId = (int) ($actor->id ?? 0);
        $ownerId = (int) $discussion->user_id;
        $discussionId = (int) $discussion->id;
        $isPaid = $currentUserId > 0 && PaidDiscussion::query()
            ->where('user_id', $currentUserId)
            ->where('discussion_id', $discussionId)
            ->exists();
        $isOwner = $currentUserId === $ownerId;
        $canBypass = $actor->hasPermission('pay2see.allowBypassPay2See');

        if (! $isPaid && ! $isOwner && ! $canBypass) {
            $replacement = '<blockquote style="text-align:center;padding:30px"><div><p>'
                .e($translator->trans('pay-to-see.forum.pay_to_see_content'))
                .'</p><div class="PayToSeePurchaseActions"><button type="button"'
                .' class="Button Button--primary PayToSeePurchaseButton"'
                .' data-discussion-id="'.$discussionId.'" data-cost="'.(int) $cost.'">'
                .'<i class="icon fas fa-coins Button-icon" aria-hidden="true"></i>'
                .'<span class="PayToSeePurchaseButton-label">'
                .e($translator->trans('pay-to-see.forum.purchase_inline_button', ['cost' => (int) $cost]))
                .'</span></button></div></div></blockquote>';

            return self::replaceContent($html, '[pay]', '[/pay]', $replacement);
        }

        $contentClass = 'pay2see_gray';
        $headerClass = 'pay2see_header_gray';
        $label = $translator->trans('pay-to-see.forum.pay_to_see_owner_bypass');

        if ($isPaid && ! $isOwner) {
            $contentClass = 'pay2see_green';
            $headerClass = 'pay2see_header_green';
            $label = $translator->trans('pay-to-see.forum.purchased_content');
        } elseif ($canBypass && ! $isOwner) {
            $label = $translator->trans('pay-to-see.forum.pay_to_see_content_bypass');
        }

        $opening = '<div class="'.e($contentClass).'"><div class="'.e($headerClass).'">'
            .e($label).'</div>';

        return str_replace(['[pay]', '[/pay]'], [$opening, '</div>'], $html);
    }

    private static function replaceContent(string $html, string $start, string $end, string $replacement): string
    {
        $regex = '/'.preg_quote($start, '/').'(.*?)'.preg_quote($end, '/').'/is';

        return (string) preg_replace($regex, $replacement, $html);
    }
}
