package com.block.goose.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.block.goose.root.RootHelper
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootToolsScreen(onBack: () -> Unit) {
    var deviceInfo by remember { mutableStateOf("Loading...") }
    var statusMessage by remember { mutableStateOf("") }
    var wifiIp by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val isRooted = RootHelper.isRooted

    LaunchedEffect(Unit) {
        deviceInfo = RootHelper.getDeviceInfo()
        wifiIp = RootHelper.getWifiIp()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Root Tools") },
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Device Info Card
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Device Info", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(deviceInfo, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Root: ${if (isRooted) "YES (${RootHelper.rootMethod})" else "NO"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isRooted)
                            MaterialTheme.colorScheme.secondary
                        else
                            MaterialTheme.colorScheme.error
                    )
                    if (wifiIp.isNotEmpty()) {
                        Text("WiFi IP: $wifiIp", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            if (!isRooted) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Text(
                        "Root access not detected. Root tools require KernelSU, NinjaSU, or Magisk.",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
                return@Scaffold
            }

            // Status message
            if (statusMessage.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    )
                ) {
                    Text(statusMessage, modifier = Modifier.padding(12.dp))
                }
            }

            // ADB WiFi Section
            Text("ADB WiFi", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    scope.launch {
                        val result = RootHelper.enableAdbWifi()
                        statusMessage = result.getOrElse { it.message ?: "Failed" }
                        wifiIp = RootHelper.getWifiIp()
                        if (wifiIp.isNotEmpty()) {
                            statusMessage += "\nConnect from PC: adb connect $wifiIp:5555"
                        }
                    }
                }) {
                    Icon(Icons.Default.Wifi, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Enable")
                }
                OutlinedButton(onClick = {
                    scope.launch {
                        val result = RootHelper.disableAdbWifi()
                        statusMessage = result.getOrElse { it.message ?: "Failed" }
                    }
                }) { Text("Disable") }
            }

            HorizontalDivider()

            // Performance Section
            Text("Performance", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    scope.launch {
                        val result = RootHelper.setCpuGovernor("performance")
                        statusMessage = result.getOrElse { it.message ?: "Failed" }
                    }
                }) { Text("Max CPU") }
                OutlinedButton(onClick = {
                    scope.launch {
                        val result = RootHelper.setCpuGovernor("schedutil")
                        statusMessage = result.getOrElse { it.message ?: "Failed" }
                    }
                }) { Text("Balanced") }
            }
            var cpuFreq by remember { mutableStateOf("") }
            var gpuModel by remember { mutableStateOf("") }
            LaunchedEffect(Unit) {
                cpuFreq = RootHelper.getCpuInfo()
                gpuModel = RootHelper.getGpuInfo()
            }
            Text("CPU: $cpuFreq kHz | GPU: $gpuModel",
                style = MaterialTheme.typography.bodySmall)

            HorizontalDivider()

            // Screen Capture
            Text("Testing", style = MaterialTheme.typography.titleMedium)
            Button(onClick = {
                scope.launch {
                    val path = "/sdcard/goose_screenshot_${System.currentTimeMillis()}.png"
                    val result = RootHelper.screenshot(path)
                    statusMessage = result.getOrElse { it.message ?: "Failed" }
                }
            }) {
                Icon(Icons.Default.CameraAlt, null, Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Screenshot")
            }

            HorizontalDivider()

            // File Browser
            Text("File System", style = MaterialTheme.typography.titleMedium)
            var browsePath by remember { mutableStateOf("/data/local/tmp") }
            var fileList by remember { mutableStateOf(listOf<String>()) }
            OutlinedTextField(
                value = browsePath,
                onValueChange = { browsePath = it },
                label = { Text("Path") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Button(onClick = {
                scope.launch {
                    val result = RootHelper.listFiles(browsePath)
                    result.onSuccess { fileList = it }
                        .onFailure { statusMessage = "Error: ${it.message}" }
                }
            }) { Text("List Files") }
            if (fileList.isNotEmpty()) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        fileList.take(20).forEach { line ->
                            Text(line, style = MaterialTheme.typography.bodySmall)
                        }
                        if (fileList.size > 20) {
                            Text("... and ${fileList.size - 20} more",
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
