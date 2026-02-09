package com.block.goose

import android.app.Application

class GooseApp : Application() {
    lateinit var gooseClient: GooseClient
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        gooseClient = GooseClient(this)
    }

    companion object {
        lateinit var instance: GooseApp
            private set
    }
}
