package com.block.goose.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.block.goose.GooseClient
import com.block.goose.ui.screens.ChatScreen
import com.block.goose.ui.screens.RootToolsScreen
import com.block.goose.ui.screens.SettingsScreen

@Composable
fun GooseNavHost(gooseClient: GooseClient) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "chat") {
        composable("chat") {
            ChatScreen(
                gooseClient = gooseClient,
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToRootTools = { navController.navigate("root_tools") }
            )
        }
        composable("settings") {
            SettingsScreen(
                gooseClient = gooseClient,
                onBack = { navController.popBackStack() }
            )
        }
        composable("root_tools") {
            RootToolsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
