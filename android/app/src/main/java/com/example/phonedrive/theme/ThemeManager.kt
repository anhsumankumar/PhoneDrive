package com.example.phonedrive.theme

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

object ThemeManager {
    var isDarkMode by mutableStateOf(true)
        private set

    fun init(context: Context) {
        val prefs = context.getSharedPreferences("phonedrive_prefs", Context.MODE_PRIVATE)
        isDarkMode = prefs.getBoolean("dark_mode", true)
    }

    fun toggleTheme(context: Context) {
        isDarkMode = !isDarkMode
        context.getSharedPreferences("phonedrive_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("dark_mode", isDarkMode)
            .apply()
    }

    fun setDarkMode(context: Context, dark: Boolean) {
        isDarkMode = dark
        context.getSharedPreferences("phonedrive_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("dark_mode", dark)
            .apply()
    }
}
