package com.frigg.helper

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.security.KeyChain
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.cert.CertificateFactory
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private val executor = Executors.newSingleThreadExecutor()

    private lateinit var editFriggUrl: EditText
    private lateinit var btnCheckConnection: Button
    private lateinit var btnInstallCa: Button
    private lateinit var btnWifiSettings: Button
    private lateinit var labelProxyAddress: TextView
    private lateinit var textStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        editFriggUrl = findViewById(R.id.editFriggUrl)
        btnCheckConnection = findViewById(R.id.btnCheckConnection)
        btnInstallCa = findViewById(R.id.btnInstallCa)
        btnWifiSettings = findViewById(R.id.btnWifiSettings)
        labelProxyAddress = findViewById(R.id.labelProxyAddress)
        textStatus = findViewById(R.id.textStatus)

        editFriggUrl.setText(resolveInitialUrl())
        updateProxyLabel(null, 8888)

        btnCheckConnection.setOnClickListener { checkConnection() }
        btnInstallCa.setOnClickListener { installCa() }
        btnWifiSettings.setOnClickListener {
            startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
        }
    }

    private fun resolveInitialUrl(): String {
        val fromIntent = intent.getStringExtra("friggUrl")
        if (!fromIntent.isNullOrBlank()) return fromIntent

        val prefs = getSharedPreferences("frigg_helper", MODE_PRIVATE)
        val saved = prefs.getString("frigg_url", null)
        if (!saved.isNullOrBlank()) return saved

        return "http://10.0.2.2:4848"
    }

    private fun currentUrl(): String {
        val url = editFriggUrl.text.toString().trimEnd('/')
        getSharedPreferences("frigg_helper", MODE_PRIVATE)
            .edit()
            .putString("frigg_url", url)
            .apply()
        return url
    }

    private fun updateProxyLabel(lanIp: String?, proxyPort: Int) {
        val host = lanIp ?: extractHost(editFriggUrl.text.toString())
        labelProxyAddress.text = "$host:$proxyPort"
    }

    private fun extractHost(url: String): String {
        return try {
            URL(url).host ?: "10.0.2.2"
        } catch (e: Exception) {
            "10.0.2.2"
        }
    }

    private fun setStatus(msg: String) {
        runOnUiThread { textStatus.text = msg }
    }

    private fun checkConnection() {
        val baseUrl = currentUrl()
        setStatus("Checking connection…")
        executor.submit {
            try {
                val conn = URL("$baseUrl/api/status").openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"
                val code = conn.responseCode
                if (code != 200) {
                    setStatus("Server returned HTTP $code")
                    return@submit
                }
                val body = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val json = JSONObject(body)
                val lanIp = if (json.has("lanIp") && !json.isNull("lanIp")) json.getString("lanIp") else null
                val proxyPort = if (json.has("proxyPort")) json.getInt("proxyPort") else 8888
                val proxyAddr = "${lanIp ?: extractHost(baseUrl)}:$proxyPort"
                runOnUiThread {
                    updateProxyLabel(lanIp, proxyPort)
                    textStatus.text = "Reachable. Proxy address: $proxyAddr"
                }
            } catch (e: Exception) {
                setStatus("Not reachable: ${e.message}")
            }
        }
    }

    private fun installCa() {
        val baseUrl = currentUrl()
        setStatus("Downloading CA certificate…")
        executor.submit {
            try {
                val conn = URL("$baseUrl/cert.der").openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 10000
                conn.requestMethod = "GET"
                val code = conn.responseCode
                if (code != 200) {
                    setStatus("Failed to download cert: HTTP $code")
                    return@submit
                }
                val derBytes = conn.inputStream.readBytes()
                conn.disconnect()

                val factory = CertificateFactory.getInstance("X.509")
                val cert = factory.generateCertificate(derBytes.inputStream())

                val installIntent = KeyChain.createInstallIntent()
                installIntent.putExtra(KeyChain.EXTRA_CERTIFICATE, cert.encoded)
                installIntent.putExtra(KeyChain.EXTRA_NAME, "Frigg")

                runOnUiThread {
                    setStatus("Opening certificate installer…")
                    startActivity(installIntent)
                }
            } catch (e: Exception) {
                setStatus("CA install failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdownNow()
    }
}
