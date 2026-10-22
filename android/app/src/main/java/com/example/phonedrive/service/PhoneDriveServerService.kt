package com.example.phonedrive.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.example.phonedrive.MainActivity
import com.example.phonedrive.R
import com.example.phonedrive.server.PhoneDriveServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PhoneDriveServerService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var server: PhoneDriveServer? = null

    companion object {
        const val CHANNEL_ID = "phonedrive_server_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_SERVER = "com.example.phonedrive.ACTION_START"
        const val ACTION_STOP_SERVER = "com.example.phonedrive.ACTION_STOP"
        const val EXTRA_PORT = "extra_port"

        data class ServerState(
            val isRunning: Boolean = false,
            val ipAddress: String? = null,
            val port: Int = 8080,
            val url: String? = null,
            val error: String? = null
        )

        private val _serverState = MutableStateFlow(ServerState())
        val serverState: StateFlow<ServerState> = _serverState.asStateFlow()

        fun start(context: Context, port: Int = 8080) {
            val intent = Intent(context, PhoneDriveServerService::class.java).apply {
                action = ACTION_START_SERVER
                putExtra(EXTRA_PORT, port)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, PhoneDriveServerService::class.java).apply {
                action = ACTION_STOP_SERVER
            }
            context.startService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_SERVER -> {
                stopServer()
                stopSelf()
            }
            ACTION_START_SERVER, null -> {
                val port = intent?.getIntExtra(EXTRA_PORT, 8080) ?: 8080
                startServer(port)
            }
        }
        return START_NOT_STICKY
    }

    private fun startServer(port: Int) {
        if (server?.isAlive == true) return

        serviceScope.launch(Dispatchers.IO) {
            val ip = NetworkMonitor.getLocalIpAddress(applicationContext) ?: "127.0.0.1"
            val accessUrl = "http://$ip:$port"

            try {
                server = PhoneDriveServer(applicationContext, port).apply {
                    start()
                }

                _serverState.value = ServerState(
                    isRunning = true,
                    ipAddress = ip,
                    port = port,
                    url = accessUrl,
                    error = null
                )

                // Start Foreground with notification
                val notification = buildNotification(accessUrl)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceCompat.startForeground(
                        this@PhoneDriveServerService,
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } catch (e: Exception) {
                _serverState.value = ServerState(
                    isRunning = false,
                    error = "Failed to start server on port $port: ${e.message}"
                )
                stopSelf()
            }
        }
    }

    private fun stopServer() {
        serviceScope.launch(Dispatchers.IO) {
            try {
                server?.stop()
            } catch (e: Exception) {
                // Ignore
            } finally {
                server = null
                _serverState.value = ServerState(
                    isRunning = false,
                    url = null,
                    ipAddress = null
                )
            }
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun buildNotification(accessUrl: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = Intent(this, PhoneDriveServerService::class.java).apply {
            action = ACTION_STOP_SERVER
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PhoneDrive is Active")
            .setContentText("Accessible at $accessUrl")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Server", stopPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PhoneDrive Server Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows the active local storage server status"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopServer()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
