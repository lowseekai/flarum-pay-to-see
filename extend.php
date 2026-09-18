<?php

use Flarum\Extend;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Resource\ForumResource;
use Flarum\Api\Resource\PostResource;
use Flarum\Discussion\Event\Saving as DiscussionSaving;
use Flarum\Post\Event\Saving as PostSaving;

use Ziven\pay2see\Api\DiscussionFields;
use Ziven\pay2see\Api\ForumFields;
use Ziven\pay2see\Api\PostFields;
use Ziven\pay2see\Controller\PayToSeePurchaseController;
use Ziven\pay2see\Controller\ListPayToSeePurchasedUserController;
use Ziven\pay2see\Controller\PayToSeeSetController;
use Ziven\pay2see\Listeners\AddPayToSeeDiscussion;
use Ziven\pay2see\Listeners\AddPayToSeePost;
use Ziven\pay2see\Notification\PayToSeeBlueprint;

$extend = [
    (new Extend\Frontend('admin'))->js(__DIR__.'/js/dist/admin.js')->css(__DIR__.'/less/admin.less'),
    (new Extend\Frontend('forum'))->js(__DIR__ . '/js/dist/forum.js')->css(__DIR__.'/less/forum.less'),
    (new Extend\Locales(__DIR__ . '/locale')),
    (new Extend\Routes('api'))
        ->post('/pay2seePurchase', 'pay2see.create', PayToSeePurchaseController::class)
        ->get('/pay2seePurchase', 'pay2see.purchased', ListPayToSeePurchasedUserController::class)
        ->post('/pay2seeSet', 'pay2see.set', PayToSeeSetController::class),
    (new Extend\Event())
        ->listen(DiscussionSaving::class, AddPayToSeeDiscussion::class)
        ->listen(PostSaving::class, AddPayToSeePost::class),
    (new Extend\ApiResource(DiscussionResource::class))
        ->fields(DiscussionFields::class),
    (new Extend\ApiResource(PostResource::class))
        ->field('contentHtml', PostFields::class),
    (new Extend\ApiResource(ForumResource::class))
        ->fields(ForumFields::class),
    (new Extend\Settings())
        ->default('pay2see.pay2seeAllowTags', [])
        ->default('pay2see.pay2seeContentBadge', 'fas fa-dollar-sign')
        ->serializeToForum('pay2seeAllowTags', 'pay2see.pay2seeAllowTags')
        ->serializeToForum('pay2seeContentBadge', 'pay2see.pay2seeContentBadge', 'strval'),
    (new Extend\Notification())
        ->type(PayToSeeBlueprint::class, ['alert']),

];

return $extend;
