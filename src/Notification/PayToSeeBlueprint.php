<?php

namespace Ziven\pay2see\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;
use Ziven\pay2see\Model\PaidDiscussion;

final class PayToSeeBlueprint implements BlueprintInterface
{
    public function __construct(
        public PaidDiscussion $pay2seePurchase,
    ) {
    }

    public function getSubject(): ?AbstractModel
    {
        return $this->pay2seePurchase->purchasedDiscussion;
    }

    public function getFromUser(): ?User
    {
        return $this->pay2seePurchase->purchasedByUser;
    }

    public function getData(): mixed
    {
        return [
            'cost' => (int) $this->pay2seePurchase->cost,
        ];
    }

    public static function getType(): string
    {
        return 'pay2see';
    }

    public static function getSubjectModel(): string
    {
        return Discussion::class;
    }
}
