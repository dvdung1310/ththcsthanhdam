<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('users.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});
