package ao.co.iesa.emanuelxangongo.gestao;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v1.20.0: plugin local da rádio em segundo plano (serviço foreground)
        registerPlugin(RadioServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
