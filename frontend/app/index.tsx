import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { C, F } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
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
  logo: {
    fontFamily: F.bold,
    fontSize: 42,
    letterSpacing: 4,
    color: C.onSurface,
  },
});
