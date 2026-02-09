package com.block.goose.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.block.goose.GooseClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    gooseClient: GooseClient,
    onBack: () -> Unit
) {
    var tunnelUrl by remember { mutableStateOf(gooseClient.tunnelUrl) }
    var tunnelSecret by remember { mutableStateOf("") }
    var connectionStatus by remember { mutableStateOf("Not tested") }
    var isTesting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Connection", style = MaterialTheme.typography.headlineSmall)

            OutlinedTextField(
                value = tunnelUrl,
                onValueChange = { tunnelUrl = it },
                label = { Text("Tunnel URL") },
                placeholder = { Text("https://your-tunnel.lapstone.dev") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = tunnelSecret,
                onValueChange = { tunnelSecret = it },
                label = { Text("Secret Key") },
                placeholder = { Text("From QR code scan") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            gooseClient.configureTunnel(tunnelUrl, tunnelSecret)
                            connectionStatus = "Saved"
                        }
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Save") }

                OutlinedButton(
                    onClick = {
                        isTesting = true
                        connectionStatus = "Testing..."
                        scope.launch {
                            val ok = gooseClient.healthCheck()
                            connectionStatus = if (ok) "Connected" else "Failed"
                            isTesting = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isTesting
                ) { Text("Test Connection") }
            }

            Surface(
                shape = MaterialTheme.shapes.medium,
                color = when (connectionStatus) {
                    "Connected" -> MaterialTheme.colorScheme.secondaryContainer
                    "Failed" -> MaterialTheme.colorScheme.errorContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Status: $connectionStatus",
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            HorizontalDivider()

            Text("Ports", style = MaterialTheme.typography.headlineSmall)

            Text(
                "Goosed API: 7878\nConscious Voice API: 8999\nMoshi Server: 8998",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()

            Text("About", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Goose AI Android Client\n" +
                "Connects to your desktop goosed agent via Lapstone tunnel.\n" +
                "Supports voice, emotion, personality, and AI creator features.\n\n" +
                "Target devices:\n" +
                "  Samsung S21 Ultra (Android 14, Snapdragon)\n" +
                "  Samsung Tab S9+ (Android 15, Snapdragon, Rooted)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
