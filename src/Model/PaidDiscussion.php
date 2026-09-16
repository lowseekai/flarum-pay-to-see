<?php

namespace Ziven\pay2see\Model;

use Flarum\Database\AbstractModel;
use Flarum\Database\ScopeVisibilityTrait;
use Flarum\User\User;
use Flarum\Discussion\Discussion;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaidDiscussion extends AbstractModel{
    use ScopeVisibilityTrait;
    protected $table = 'ziven_paid_discussion';
    
    public function purchasedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
    
    public function purchasedDiscussion(): BelongsTo
    {
        return $this->belongsTo(Discussion::class, 'discussion_id');
    }
}
