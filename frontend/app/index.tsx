import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { C, F } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <Image
          source={require("../assets/images/azvio-logo.png")}
          style={styles.logoImg}
          resizeMode="contain"
        />
        <Text style={styles.logo}>
          AZV<Text style={{ color: C.brand }}>IO</Text>
        </Text>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  logoImg: { width: 96, height: 92 },
  logo: {
    fontFamily: F.bold,
    fontSize: 32,
    letterSpacing: 3,
    color: C.onSurface,
  },
});
